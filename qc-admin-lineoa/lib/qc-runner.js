// qc-runner — รวม pipeline การให้คะแนน 1 ที่ (ใช้ทั้ง log-reply และ admin/reply)
//   score → insert qc_scores (เต็ม) → insert qc_score_details → telegram alert
import { query } from "@/lib/db";
import { scoreReply } from "@/lib/qc-engine";
import { generateCoaching } from "@/lib/coaching";
import { matchSOP } from "@/lib/sop-matcher";
import { loadKnowledge, isSlaException } from "@/lib/qc-shared";
import { qcAlert } from "@/lib/telegram";

export async function runQc({
  conversationId,
  customerMessageId,
  adminMessageId,
  adminId,
  lineUserId,
  customerText = "",
  adminText = "",
  responseSeconds = null,
  createdAt = null,
  adminName = null,
  customerName = null,
  responseLimitMinutes = 5,
}) {
  const { sops, fatalRules } = await loadKnowledge();
  const sla = await isSlaException(createdAt || new Date());

  const qc = scoreReply({
    customerText,
    adminText,
    responseSeconds,
    responseLimitMinutes,
    sops,
    fatalRules,
    slaException: sla.active,
  });

  const sopMatch = matchSOP(customerText || adminText, sops);
  const sop = sopMatch.sop || null;
  const coaching = generateCoaching({ customerText, adminText, scoreResult: qc, sop });

  const row = await query`
    INSERT INTO qc_scores (
      conversation_id, customer_message_id, admin_message_id, admin_id, line_user_id,
      response_seconds, speed_score, correctness_score, sentiment_score,
      final_score, fail_reasons, matched_rules, created_at,
      intent, matched_sop_id, matched_sop_topic, expected_sop_answer, sop_confidence,
      dimension_scores, is_fatal, fatal_reasons, minor_issues, coaching,
      sla_exception, evidence, commission_tier
    ) VALUES (
      ${conversationId}, ${customerMessageId}, ${adminMessageId}, ${adminId}, ${lineUserId || null},
      ${responseSeconds}, ${qc.speedScore}, ${qc.correctnessScore}, ${qc.sentimentScore},
      ${qc.finalScore}, ${JSON.stringify(qc.failReasons)}, ${JSON.stringify(qc.matchedRules)},
      ${createdAt || new Date().toISOString()},
      ${qc.intent}, ${sop?.id || null}, ${sop?.topic || null}, ${sop?.answer || null}, ${qc.sopConfidence},
      ${JSON.stringify(qc.dimensions)}, ${qc.isFatal}, ${JSON.stringify(qc.fatalReasons)},
      ${JSON.stringify(qc.minorIssues)}, ${coaching ? JSON.stringify(coaching) : null},
      ${qc.slaException}, ${JSON.stringify(qc.evidence)}, ${JSON.stringify(qc.commissionTier)}
    ) RETURNING *`;
  qc.id = row[0].id;
  qc.coaching = coaching;

  // รายมิติ
  for (const d of qc.details || []) {
    await query`INSERT INTO qc_score_details (qc_score_id, category_code, raw_score, weighted_score, max_score, pass, evidence, fail_reason, suggestion)
      VALUES (${qc.id}, ${d.category_code}, ${d.raw_score}, ${d.weighted_score}, ${d.max_score}, ${d.pass},
              ${JSON.stringify(d.evidence || {})}, ${d.fail_reason || null}, ${d.suggestion || null})`.catch(() => {});
  }

  // นับ used_count ของ SOP
  if (sop?.id)
    await query`UPDATE sop_scripts SET used_count = COALESCE(used_count,0) + 1 WHERE id = ${sop.id}`.catch(() => {});

  // Telegram
  const slaFail = !sla.active && qc.dimensions?.responseTime != null && qc.dimensions.responseTime < 60;
  if (qc.isFatal || qc.finalScore < 70 || slaFail) {
    const failedCats = (qc.details || [])
      .filter((x) => x.applicable && x.pass === false && !["minorError", "fatalError"].includes(x.category_code))
      .map((x) => x.category_code);
    qcAlert({
      kind: qc.isFatal ? "FATAL" : slaFail ? "SLA FAIL" : "FAIL",
      admin: adminName || adminId,
      customer: customerName || lineUserId,
      score: qc.finalScore,
      intent: qc.intent,
      sop: qc.matchedSop?.topic,
      failedCats,
      reason: qc.failReasons.join(" · "),
      suggestion: coaching?.suggested_reply,
      lineUserId,
      slaException: qc.slaException,
    }).catch(() => {});
  }

  return qc;
}

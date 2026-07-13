// qc-runner — รวม pipeline การให้คะแนน 1 ที่ (ใช้ทั้ง log-reply และ admin/reply)
//   score → insert qc_scores (เต็ม) → insert qc_score_details → telegram alert
import { query } from "@/lib/db";
import { scoreReply } from "@/lib/qc-engine";
import { generateCoaching } from "@/lib/coaching";
import { matchSOP } from "@/lib/sop-matcher";
import { loadKnowledge, isSlaException } from "@/lib/qc-shared";
import { qcAlert } from "@/lib/telegram";
import { enqueueAiReview, saveQcEvidence } from "@/lib/qc-review";

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
  scraperJobId = null,
  customerCreatedAt = null,
  source = null,
  // exact-pair evidence: ทุก bubble ที่ประกอบเป็นคู่ (block ลูกค้า/หลาย bubble ของแอดมิน)
  customerMessageIds = null,
  adminMessageIds = null,
  customerSourceKeys = null,
  adminSourceKeys = null,
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
  const coaching = generateCoaching({
    customerText,
    adminText,
    scoreResult: qc,
    sop,
  });

  const row = await query`
    INSERT INTO qc_scores (
      conversation_id, customer_message_id, admin_message_id, admin_id, line_user_id,
      response_seconds, speed_score, correctness_score, sentiment_score,
      final_score, fail_reasons, matched_rules, created_at, case_date, case_at,
      intent, matched_sop_id, matched_sop_topic, expected_sop_answer, sop_confidence,
      dimension_scores, is_fatal, fatal_reasons, minor_issues, coaching,
      sla_exception, evidence, commission_tier,
      customer_message_ids, admin_message_ids, customer_source_keys, admin_source_keys
    ) VALUES (
      ${conversationId}, ${customerMessageId}, ${adminMessageId}, ${adminId}, ${lineUserId || null},
      ${responseSeconds}, ${qc.speedScore}, ${qc.correctnessScore}, ${qc.sentimentScore},
      ${qc.finalScore}, ${JSON.stringify(qc.failReasons)}, ${JSON.stringify(qc.matchedRules)},
      ${createdAt || new Date().toISOString()},
      (${customerCreatedAt || createdAt || new Date().toISOString()}::timestamptz AT TIME ZONE 'Asia/Bangkok')::date,
      -- canonical case_at: เวลาแอดมินตอบ → เวลาลูกค้า → created_at (เวลาแชทจริง ไม่ใช่เวลา scrape)
      COALESCE(
        (SELECT created_at FROM messages WHERE id = ${adminMessageId}::uuid),
        (SELECT created_at FROM messages WHERE id = ${customerMessageId}::uuid),
        ${createdAt || customerCreatedAt || new Date().toISOString()}::timestamptz),
      ${qc.intent}, ${sop?.id || null}, ${sop?.topic || null}, ${sop?.answer || null}, ${qc.sopConfidence},
      ${JSON.stringify(qc.dimensions)}, ${qc.isFatal}, ${JSON.stringify(qc.fatalReasons)},
      ${JSON.stringify(qc.minorIssues)}, ${coaching ? JSON.stringify(coaching) : null},
      ${qc.slaException}, ${JSON.stringify(qc.evidence)}, ${JSON.stringify(qc.commissionTier)},
      ${customerMessageIds ? JSON.stringify(customerMessageIds) : null},
      ${adminMessageIds ? JSON.stringify(adminMessageIds) : null},
      ${customerSourceKeys ? JSON.stringify(customerSourceKeys) : null},
      ${adminSourceKeys ? JSON.stringify(adminSourceKeys) : null}
    ) RETURNING *`;
  qc.id = row[0].id;
  // case_ref: QC-YYYYMMDD-XXXXXX — ตั้งทันทีหลังรู้ id (เสถียร ใช้เป็นชื่อไฟล์หลักฐาน)
  //   YYYYMMDD = case_date (วัน Bangkok ของ "ข้อความลูกค้า") — นิยามเดียวกับ ai_review_queue
  //   (เดิมใช้เวลาแอดมินตอบ → เคสคร่อมเที่ยงคืนได้ ref คนละวันกับคิว AI Review)
  const cr = await query`UPDATE qc_scores SET case_ref =
      'QC-' || to_char(COALESCE(case_date, (created_at AT TIME ZONE 'Asia/Bangkok')::date),'YYYYMMDD') || '-' || upper(substr(md5(id::text),1,6))
    WHERE id = ${qc.id} AND case_ref IS NULL RETURNING case_ref`.catch(() => []);
  qc.caseRef = cr[0]?.case_ref || row[0].case_ref || null;
  qc.coaching = coaching;

  // รายมิติ
  for (const d of qc.details || []) {
    await query`INSERT INTO qc_score_details (qc_score_id, category_code, raw_score, weighted_score, max_score, pass, evidence, fail_reason, suggestion)
      VALUES (${qc.id}, ${d.category_code}, ${d.raw_score}, ${d.weighted_score}, ${d.max_score}, ${d.pass},
              ${JSON.stringify(d.evidence || {})}, ${d.fail_reason || null}, ${d.suggestion || null})`.catch(
      () => {},
    );
  }

  // นับ used_count ของ SOP
  if (sop?.id)
    await query`UPDATE sop_scripts SET used_count = COALESCE(used_count,0) + 1 WHERE id = ${sop.id}`.catch(
      () => {},
    );

  // UAT: เก็บหลักฐาน (เคส fail/late/fatal) + เข้าคิว AI review เมื่อ AI ไม่มั่นใจ
  const reviewCtx = {
    conversationId,
    customerMessageId,
    adminMessageId,
    sop,
    customerText,
    adminText,
    customerName,
    adminName,
    responseSeconds,
    responseLimitMinutes,
    createdAt,
    customerCreatedAt,
    scraperJobId,
    source,
  };
  await saveQcEvidence(qc, reviewCtx).catch(() => {});
  await enqueueAiReview(qc, reviewCtx).catch(() => {});

  // Telegram
  const slaFail =
    !sla.active &&
    qc.dimensions?.responseTime != null &&
    qc.dimensions.responseTime < 60;
  if (qc.isFatal || qc.finalScore < 70 || slaFail) {
    const failedCats = (qc.details || [])
      .filter(
        (x) =>
          x.applicable &&
          x.pass === false &&
          !["minorError", "fatalError"].includes(x.category_code),
      )
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

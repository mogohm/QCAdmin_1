// qc-review — เก็บเคสที่ AI ไม่มั่นใจเข้า ai_review_queue + บันทึกหลักฐานลง case_evidence
//   เรียกจาก runQc (log-reply / admin-reply / manual-case) หลัง insert qc_scores
import { query } from "@/lib/db";

const CONF_THRESHOLD = 60; // ต่ำกว่านี้ = AI ไม่มั่นใจ
const LOW_SCORE = 70;

// เงื่อนไขเข้าคิว AI review + เหตุผล (คืน null ถ้าไม่ต้องเข้าคิว)
export function reviewReason(qc, sop) {
  const reasons = [];
  const sopConf = Number(qc.sopConfidence ?? 0);
  if (!sop) reasons.push("ไม่พบ SOP ที่ตรงกับเคส");
  else if (sopConf < CONF_THRESHOLD)
    reasons.push(`SOP confidence ต่ำ (${sopConf}%)`);
  if (!qc.intent || qc.intent === "unknown" || qc.intent === "general")
    reasons.push("AI ระบุ intent ไม่ชัด");
  if (Number(qc.finalScore ?? 100) < LOW_SCORE)
    reasons.push(`คะแนนต่ำ (${qc.finalScore})`);
  if (!qc.evidence || (Array.isArray(qc.evidence) && qc.evidence.length === 0))
    reasons.push("หลักฐาน/evidence ไม่ครบ");
  return reasons.length ? reasons.join(" · ") : null;
}

// เข้าคิว AI review ถ้าเข้าเงื่อนไข (idempotent ต่อ qc_score_id)
export async function enqueueAiReview(qc, ctx = {}) {
  try {
    const sop = ctx.sop || null;
    const reason = reviewReason(qc, sop);
    if (!reason) return null;
    if (qc.id) {
      const dup =
        await query`SELECT id FROM ai_review_queue WHERE qc_score_id = ${qc.id} LIMIT 1`;
      if (dup[0]) return dup[0].id;
    }
    const rows = await query`
      INSERT INTO ai_review_queue (
        qc_score_id, conversation_id, message_id, customer_name, admin_name,
        customer_text, admin_text, detected_intent, intent_confidence,
        matched_sop_id, sop_confidence, reason, status)
      VALUES (
        ${qc.id || null}, ${ctx.conversationId || null}, ${ctx.adminMessageId || null},
        ${ctx.customerName || null}, ${ctx.adminName || null},
        ${ctx.customerText || null}, ${ctx.adminText || null},
        ${qc.intent || null}, ${qc.sopConfidence ?? null},
        ${sop?.id || null}, ${qc.sopConfidence ?? null}, ${reason}, 'pending')
      RETURNING id`;
    return rows[0]?.id || null;
  } catch (e) {
    console.error("enqueueAiReview:", e.message);
    return null;
  }
}

// บันทึกหลักฐาน 1+ รายการ ([{evidence_type,title,data,file_path,url}])
export async function saveEvidence(items = [], ctx = {}) {
  for (const it of items) {
    if (!it) continue;
    await query`
      INSERT INTO case_evidence (qc_score_id, conversation_id, scraper_job_id, evidence_type, title, file_path, url, data)
      VALUES (${ctx.qcScoreId || null}, ${ctx.conversationId || null}, ${ctx.scraperJobId || null},
              ${it.evidence_type}, ${it.title || null}, ${it.file_path || null}, ${it.url || null},
              ${JSON.stringify(it.data || {})})`.catch((e) =>
      console.error("saveEvidence:", e.message),
    );
  }
}

// สร้าง evidence มาตรฐานจากผล QC (chat_text + raw_json + late_response ถ้าตอบช้า)
export async function saveQcEvidence(qc, ctx = {}) {
  const items = [];
  const failed = qc.isFatal || Number(qc.finalScore ?? 100) < LOW_SCORE;
  const late =
    ctx.responseSeconds != null &&
    ctx.responseLimitMinutes != null &&
    !qc.slaException
      ? Number(ctx.responseSeconds) > Number(ctx.responseLimitMinutes) * 60
      : false;
  // เก็บ chat_text + raw_json เสมอสำหรับเคส fail/late/fatal (ให้หัวหน้าตรวจย้อนได้)
  if (failed || late) {
    items.push({
      evidence_type: "chat_text",
      title: "บทสนทนา (ลูกค้า/แอดมิน)",
      data: {
        customer_text: ctx.customerText || "",
        admin_text: ctx.adminText || "",
      },
    });
    items.push({
      evidence_type: "raw_json",
      title: "ผล QC (คะแนน/เหตุผล/หลักฐาน)",
      data: {
        final_score: qc.finalScore,
        dimensions: qc.dimensions,
        fail_reasons: qc.failReasons,
        intent: qc.intent,
        matched_sop_id: ctx.sop?.id || null,
        evidence: qc.evidence,
        response_seconds: ctx.responseSeconds ?? null,
      },
    });
  }
  if (late) {
    items.push({
      evidence_type: "late_response",
      title: "ตอบช้ากว่า SLA",
      data: {
        response_seconds: ctx.responseSeconds,
        sla_limit_seconds: Number(ctx.responseLimitMinutes) * 60,
        customer_ts: ctx.customerCreatedAt || null,
        admin_ts: ctx.createdAt || null,
      },
    });
  }
  if (ctx.screenshotPath)
    items.push({
      evidence_type: "screenshot",
      title: "ภาพหน้าจอ",
      file_path: ctx.screenshotPath,
    });
  if (ctx.htmlPath)
    items.push({
      evidence_type: "html",
      title: "HTML ต้นฉบับ",
      file_path: ctx.htmlPath,
    });
  if (items.length) await saveEvidence(items, { ...ctx, qcScoreId: qc.id });
  return items.length;
}

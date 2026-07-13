// ============================================================
// GET /api/ai-review — คิวเคสที่ AI ไม่มั่นใจ/ไม่เข้าใจ (ให้ QC/หัวหน้าตรวจ)
// ------------------------------------------------------------
//   Query:
//     status : pending (default) | approved | corrected | not_relevant | all
//     page   : หน้า (เริ่ม 1) · limit : ต่อหน้า (default 50, สูงสุด 100)
//   Response:
//     { items: [...ai_review_queue + matched_sop_topic/answer], counts: [{status, n}],
//       total, page, pages, limit }   ← pagination จริง (เดิม cap 200 แถว งานเก่ากว่านั้นมองไม่เห็น)
//   Permission (server-enforced): qc.dispute.review หรือ qc.score.override
//     (การ enforce อยู่ที่ API ไม่ใช่แค่ซ่อนเมนู)
//   เคสถูก enqueue อัตโนมัติจาก runQc เมื่อ: ไม่พบ SOP / sop_confidence ต่ำ /
//     intent ไม่ชัด / คะแนนต่ำ / หลักฐานไม่ครบ (ดู lib/qc-review.js)
// ============================================================
import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";
import { IMG_EVIDENCE_TYPES } from "@/lib/evidence-integrity";

export async function GET(req) {
  // ต้องมีสิทธิ์ตรวจ dispute หรือ override คะแนน
  const gate = guard(req, "qc.dispute.review", "qc.score.override");
  if (gate) return gate;
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") || "pending";
  // pagination จริง (pattern เดียวกับ /api/replies): clamp limit 1..100, page เริ่ม 1
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "50", 10) || 50));
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const offset = (page - 1) * limit;
  try {
    // join SOP ที่ AI เดา (matched_sop_id) เพื่อให้หัวหน้าเทียบกับคำตอบจริง
    // นับหลักฐานแยกชนิด — evidence_count รวม late_response/raw_json/summary ซึ่ง "ไม่ใช่ภาพ"
    //   ป้าย "มีภาพ" ต้องดูจาก screenshot_count/verified เท่านั้น
    const rows = await query`
      SELECT r.*, s.topic AS matched_sop_topic, s.answer AS matched_sop_answer,
        COALESCE(ev.evidence_count, 0) AS evidence_count,
        COALESCE(ev.screenshot_count, 0) AS screenshot_count,
        COALESCE(ev.verified_screenshot_count, 0) AS verified_screenshot_count,
        (COALESCE(ev.screenshot_count, 0) - COALESCE(ev.verified_screenshot_count, 0)
          + COALESCE(refimg.n, 0)) AS reference_screenshot_count,
        (COALESCE(ev.verified_screenshot_count, 0) > 0) AS has_verified_screenshot,
        ((COALESCE(ev.screenshot_count, 0) - COALESCE(ev.verified_screenshot_count, 0)
          + COALESCE(refimg.n, 0)) > 0) AS has_reference_screenshot
      FROM ai_review_queue r
      LEFT JOIN sop_scripts s ON s.id = r.matched_sop_id
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS evidence_count,
               count(*) FILTER (WHERE e.evidence_type = ANY(${IMG_EVIDENCE_TYPES}))::int AS screenshot_count,
               count(*) FILTER (WHERE e.evidence_type = ANY(${IMG_EVIDENCE_TYPES})
                 AND e.verification_status = 'verified' AND e.match_status = 'exact')::int AS verified_screenshot_count
        FROM case_evidence e WHERE r.qc_score_id IS NOT NULL AND e.qc_score_id = r.qc_score_id
      ) ev ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS n FROM case_evidence e2
        WHERE r.conversation_id IS NOT NULL AND e2.conversation_id = r.conversation_id
          AND (e2.qc_score_id IS NULL OR r.qc_score_id IS NULL OR e2.qc_score_id <> r.qc_score_id)
          AND e2.evidence_type = ANY(${IMG_EVIDENCE_TYPES})
      ) refimg ON true
      WHERE (${status}::text = 'all' OR r.status = ${status})
      ORDER BY r.status = 'pending' DESC, r.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`;
    // สรุปจำนวนแต่ละสถานะ (badge บน UI) — และใช้คิด total ของ filter ปัจจุบัน
    const counts =
      await query`SELECT status, count(*)::int n FROM ai_review_queue GROUP BY status`.catch(
        () => [],
      );
    const total =
      status === "all"
        ? counts.reduce((s, c) => s + (c.n || 0), 0)
        : counts.find((c) => c.status === status)?.n || 0;
    return Response.json({
      items: rows,
      counts,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
    });
  } catch (e) {
    // ถ้าตารางยังไม่ถูก migrate จะเข้ามาที่นี่ (คืน items ว่างแทน crash)
    return Response.json({ error: e.message, items: [] }, { status: 500 });
  }
}

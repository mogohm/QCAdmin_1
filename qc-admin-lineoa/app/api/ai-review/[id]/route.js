// PATCH /api/ai-review/:id — หัวหน้าตรวจเคส AI: อนุมัติ/แก้ intent/แก้ SOP/ไม่เกี่ยว QC
//   body: { action: 'approve'|'correct'|'not_relevant', corrected_intent?, corrected_sop_id?, reviewer_note? }
import { query } from "@/lib/db";
import { guard, getCurrentUser } from "@/lib/permissions";

export async function PATCH(req, { params }) {
  const gate = guard(req, "qc.dispute.review", "qc.score.override");
  if (gate) return gate;
  const me = getCurrentUser(req);
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const action = b.action || "approve";
  const status =
    action === "not_relevant"
      ? "not_relevant"
      : action === "correct"
        ? "corrected"
        : "approved";
  try {
    const rows = await query`
      UPDATE ai_review_queue SET
        status = ${status},
        review_action = ${action},
        corrected_intent = ${b.corrected_intent ?? null},
        corrected_sop_id = ${b.corrected_sop_id ?? null},
        reviewer_note = ${b.reviewer_note ?? null},
        reviewed_by = ${me?.uid || null},
        reviewed_at = now()
      WHERE id = ${id} RETURNING *`;
    if (!rows[0]) return Response.json({ error: "not found" }, { status: 404 });
    // ถ้าแก้ intent/SOP ให้อัปเดต qc_scores ที่เกี่ยว (ปรับ intent/matched sop)
    if (action === "correct" && rows[0].qc_score_id) {
      await query`UPDATE qc_scores SET intent = COALESCE(${b.corrected_intent ?? null}, intent),
                    matched_sop_id = COALESCE(${b.corrected_sop_id ?? null}, matched_sop_id)
                  WHERE id = ${rows[0].qc_score_id}`.catch(() => {});
    }
    return Response.json({ ok: true, item: rows[0] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

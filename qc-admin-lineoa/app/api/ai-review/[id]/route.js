// PATCH /api/ai-review/:id — หัวหน้าตรวจเคส AI: อนุมัติ/แก้ intent/แก้ SOP/ไม่เกี่ยว QC
//   body: { action: 'approve'|'correct'|'not_relevant', corrected_intent?, corrected_sop_id?, reviewer_note? }
import { query } from "@/lib/db";
import { guard, getCurrentUser } from "@/lib/permissions";
import { validateEntityId, parseNumericId } from "@/lib/db-id";

export async function PATCH(req, { params }) {
  const gate = guard(req, "qc.dispute.review", "qc.score.override");
  if (gate) return gate;
  const me = getCurrentUser(req);
  const { id } = await params;
  // ai_review_queue.id เป็น UUID — validate ก่อน query กัน raw SQL error (เช่น id="23")
  const v = validateEntityId(id, "uuid");
  if (!v.ok)
    return Response.json(
      {
        error:
          "ไม่สามารถดำเนินการได้ เนื่องจากข้อมูลเคสไม่ถูกต้อง กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ",
      },
      { status: 400 },
    );
  const b = await req.json().catch(() => ({}));
  const action = b.action || "approve";
  const status =
    action === "not_relevant"
      ? "not_relevant"
      : action === "correct"
        ? "corrected"
        : "approved";
  // reviewed_by เป็น TEXT (ให้ตรงกับ qc_disputes/registration) — เก็บชื่อผู้ตรวจ ไม่ใช่ uid ตัวเลข
  const reviewer = me?.name || (me?.uid != null ? String(me.uid) : "system");
  // corrected_sop_id เป็น INTEGER (sop_scripts.id) — validate ให้เป็นตัวเลขหรือ null
  const correctedSopId =
    b.corrected_sop_id == null ? null : parseNumericId(b.corrected_sop_id);
  try {
    const rows = await query`
      UPDATE ai_review_queue SET
        status = ${status},
        review_action = ${action},
        corrected_intent = ${b.corrected_intent ?? null},
        corrected_sop_id = ${correctedSopId},
        reviewer_note = ${b.reviewer_note ?? null},
        reviewed_by = ${reviewer},
        reviewed_at = now()
      WHERE id = ${v.value}::uuid RETURNING *`;
    if (!rows[0])
      return Response.json({ error: "ไม่พบเคสนี้ในระบบ" }, { status: 404 });
    // ถ้าแก้ intent/SOP ให้อัปเดต qc_scores ที่เกี่ยว (ปรับ intent/matched sop)
    if (action === "correct" && rows[0].qc_score_id) {
      await query`UPDATE qc_scores SET intent = COALESCE(${b.corrected_intent ?? null}, intent),
                    matched_sop_id = COALESCE(${correctedSopId}, matched_sop_id)
                  WHERE id = ${rows[0].qc_score_id}`.catch(() => {});
    }
    return Response.json({ ok: true, item: rows[0] });
  } catch (e) {
    // เก็บ error เต็มไว้ที่ server log, คืนข้อความไทยที่ผู้ใช้เข้าใจ
    console.error("[ai-review PATCH]", e.message);
    return Response.json(
      {
        error:
          "ไม่สามารถบันทึกผลการตรวจได้ กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาโปรดติดต่อผู้ดูแลระบบ",
      },
      { status: 500 },
    );
  }
}

import { query } from "@/lib/db";
import { readSession } from "@/lib/session";
import { guard } from "@/lib/permissions";
import { validateEntityId } from "@/lib/db-id";

// PATCH — manager review dispute (approved/rejected) — ต้องมี qc.dispute.review
export async function PATCH(req, { params }) {
  const gate = guard(req, "qc.dispute.review");
  if (gate) return gate;
  const s = readSession(req);
  const { id } = await params;
  // qc_disputes.id เป็น UUID — validate ก่อน query กัน raw SQL error
  const vid = validateEntityId(id, "uuid");
  if (!vid.ok)
    return Response.json(
      { error: "ไม่สามารถดำเนินการได้ เนื่องจากรหัสข้อโต้แย้งไม่ถูกต้อง" },
      { status: 400 },
    );
  const b = await req.json().catch(() => ({}));
  const status = b.status;
  if (!["approved", "rejected", "pending"].includes(status))
    return Response.json(
      { error: "status ต้องเป็น approved/rejected/pending" },
      { status: 400 },
    );

  try {
    const d = await query`SELECT * FROM qc_disputes WHERE id = ${vid.value}::uuid`;
    if (!d[0])
      return Response.json({ error: "ไม่พบข้อโต้แย้งนี้ในระบบ" }, { status: 404 });

    let newScore = d[0].new_score;
    if (status === "approved" && b.new_score != null) {
      newScore = Math.max(0, Math.min(100, parseInt(b.new_score)));
      await query`UPDATE qc_scores SET final_score = ${newScore} WHERE id = ${d[0].qc_score_id}`;
    }

    const rows = await query`
      UPDATE qc_disputes SET
        status = ${status},
        reviewer_note = ${b.reviewer_note ?? null},
        reviewed_by = ${b.reviewed_by || s?.name || "manager"},
        new_score = ${newScore ?? null},
        reviewed_at = now()
      WHERE id = ${vid.value}::uuid RETURNING *`;
    return Response.json({
      ok: true,
      dispute: rows[0],
      updated_score: status === "approved" ? newScore : null,
    });
  } catch (e) {
    console.error("[qc-disputes PATCH]", e.message);
    return Response.json(
      { error: "ไม่สามารถบันทึกผลการตรวจข้อโต้แย้งได้ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

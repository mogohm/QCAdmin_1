import { query } from "@/lib/db";
import { readSession } from "@/lib/session";
import { guard } from "@/lib/permissions";

// PATCH — manager review dispute (approved/rejected) — ต้องมี qc.dispute.review
export async function PATCH(req, { params }) {
  const gate = guard(req, "qc.dispute.review");
  if (gate) return gate;
  const s = readSession(req);
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const status = b.status;
  if (!["approved", "rejected", "pending"].includes(status))
    return Response.json({ error: "status ต้องเป็น approved/rejected/pending" }, { status: 400 });

  try {
    const d = await query`SELECT * FROM qc_disputes WHERE id = ${id}`;
    if (!d[0]) return Response.json({ error: "not found" }, { status: 404 });

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
      WHERE id = ${id} RETURNING *`;
    return Response.json({ ok: true, dispute: rows[0], updated_score: status === "approved" ? newScore : null });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

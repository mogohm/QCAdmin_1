import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { readSession } from "@/lib/session";

// PATCH — manager review dispute (approved/rejected)
//   ถ้า approved + new_score → update qc_scores.final_score
export async function PATCH(req, { params }) {
  const s = readSession(req);
  const isManager = (s && s.role === "manager") || requireAdmin(req);
  if (!isManager) return Response.json({ error: "unauthorized (manager only)" }, { status: 401 });

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

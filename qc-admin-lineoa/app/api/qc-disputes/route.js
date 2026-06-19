import { query } from "@/lib/db";
import { readSession } from "@/lib/session";
import { guard } from "@/lib/permissions";
import { sendTelegram } from "@/lib/telegram";

// GET /api/qc-disputes?status=pending — list (manager เห็นทั้งหมด, admin เห็นของตัวเอง)
export async function GET(req) {
  const gate = guard(req, "qc.dispute.review", "qc.dispute.create");
  if (gate) return gate;
  const s = readSession(req);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const af =
    s?.role === "admin"
      ? s.adminId || "00000000-0000-0000-0000-000000000000"
      : null;
  try {
    const rows = await query`
      SELECT d.*, a.member_name AS admin_name, q.final_score AS current_score, q.intent,
             q.matched_sop_topic, q.expected_sop_answer, q.fail_reasons AS ai_reason,
             q.is_fatal, q.dimension_scores, q.evidence AS ai_evidence, q.sla_exception,
             cm.message_text AS customer_question, am.message_text AS admin_answer,
             (SELECT json_agg(json_build_object('category_code',category_code,'raw_score',raw_score,
                'pass',pass,'fail_reason',fail_reason) ORDER BY id)
              FROM qc_score_details WHERE qc_score_id = q.id) AS score_details
      FROM qc_disputes d
      LEFT JOIN qc_admins a ON a.id = d.admin_id
      LEFT JOIN qc_scores q ON q.id = d.qc_score_id
      LEFT JOIN messages cm ON cm.id = q.customer_message_id
      LEFT JOIN messages am ON am.id = q.admin_message_id
      WHERE (${status}::text IS NULL OR d.status = ${status})
        AND (${af}::uuid IS NULL OR d.admin_id = ${af}::uuid)
      ORDER BY d.status='pending' DESC, d.created_at DESC LIMIT 100`;
    const counts =
      await query`SELECT status, count(*)::int n FROM qc_disputes GROUP BY status`;
    return Response.json({ disputes: rows, counts });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST — admin โต้แย้งผล AI
export async function POST(req) {
  const gate = guard(req, "qc.dispute.create", "qc.dispute.review");
  if (gate) return gate;
  const s = readSession(req);
  const b = await req.json().catch(() => ({}));
  if (!b.qc_score_id || !b.reason)
    return Response.json(
      { error: "qc_score_id, reason required" },
      { status: 400 },
    );
  try {
    const sc =
      await query`SELECT id, admin_id, final_score, line_user_id FROM qc_scores WHERE id = ${b.qc_score_id}`;
    if (!sc[0])
      return Response.json({ error: "qc_score not found" }, { status: 404 });
    const adminId = b.admin_id || s?.adminId || sc[0].admin_id;
    const dup =
      await query`SELECT id FROM qc_disputes WHERE qc_score_id = ${b.qc_score_id} AND status='pending' LIMIT 1`;
    if (dup[0])
      return Response.json(
        { error: "มี dispute pending อยู่แล้ว", id: dup[0].id },
        { status: 409 },
      );

    const rows = await query`
      INSERT INTO qc_disputes (qc_score_id, admin_id, line_user_id, reason, old_score, status)
      VALUES (${b.qc_score_id}, ${adminId}, ${sc[0].line_user_id || null}, ${b.reason}, ${sc[0].final_score}, 'pending')
      RETURNING *`;
    const an =
      await query`SELECT member_name FROM qc_admins WHERE id = ${adminId}`;
    sendTelegram(
      `[DISPUTE CREATED]\nAdmin: ${an[0]?.member_name || adminId}\nScore: ${sc[0].final_score}\nReason: ${b.reason}`,
    ).catch(() => {});
    return Response.json({ ok: true, dispute: rows[0] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

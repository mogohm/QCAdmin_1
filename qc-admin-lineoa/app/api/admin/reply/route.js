import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";
import { pushLineText } from "@/lib/line";
import { runQc } from "@/lib/qc-runner";

export async function POST(req) {
  const g = guard(req, "chat.reply");
  if (g) return g;
  const { conversation_id, admin_id, text, send_line = true } = await req.json();
  if (!conversation_id || !admin_id || !text)
    return Response.json({ error: "conversation_id, admin_id, text required" }, { status: 400 });

  const conv =
    await query`SELECT c.*, lc.line_user_id, lc.display_name FROM conversations c JOIN line_customers lc ON lc.line_user_id=c.line_user_id WHERE c.id=${conversation_id}`;
  if (!conv[0]) return Response.json({ error: "conversation not found" }, { status: 404 });

  const lastCustomer =
    await query`SELECT * FROM messages WHERE conversation_id=${conversation_id} AND direction='customer' ORDER BY created_at DESC LIMIT 1`;
  if (send_line) await pushLineText(conv[0].line_user_id, text);

  const adminMsg = await query`INSERT INTO messages(conversation_id,line_user_id,admin_id,direction,message_text)
    VALUES(${conversation_id},${conv[0].line_user_id},${admin_id},'admin',${text}) RETURNING *`;
  await query`UPDATE conversations SET assigned_admin_id=${admin_id} WHERE id=${conversation_id}`;

  let qc = null;
  if (lastCustomer[0]) {
    const settings = await query`SELECT value FROM app_settings WHERE key='response_limit_minutes'`;
    const diff =
      await query`SELECT EXTRACT(EPOCH FROM (${adminMsg[0].created_at}::timestamptz - ${lastCustomer[0].created_at}::timestamptz))::int AS sec`;
    const an = await query`SELECT member_name FROM qc_admins WHERE id=${admin_id}`;
    // qc-runner: SOP จริง + fatal + system_events SLA + qc_score_details + telegram
    qc = await runQc({
      conversationId: conversation_id,
      customerMessageId: lastCustomer[0].id,
      adminMessageId: adminMsg[0].id,
      adminId: admin_id,
      lineUserId: conv[0].line_user_id,
      customerText: lastCustomer[0].message_text,
      adminText: text,
      responseSeconds: diff[0].sec,
      createdAt: adminMsg[0].created_at,
      adminName: an[0]?.member_name,
      customerName: conv[0].display_name,
      responseLimitMinutes: settings[0]?.value || process.env.QC_RESPONSE_LIMIT_MINUTES || 5,
    });
  }
  return Response.json({ ok: true, qc });
}
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

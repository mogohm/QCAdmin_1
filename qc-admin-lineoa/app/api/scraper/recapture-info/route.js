// ============================================================
// GET /api/scraper/recapture-info?qc_score_id=... — ข้อมูลสำหรับ recapture หลักฐานเคสเก่า
//   ใช้โดย: node scraper.js --recapture-evidence=<qc_score_id>
//   คืน: case_ref, conversation/line_user_id, คู่ข้อความ (ids + source keys + text + เวลา)
//   Auth: x-api-key (scraper service)
// ============================================================
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { validateEntityId } from "@/lib/db-id";

export async function GET(req) {
  if (!requireAdmin(req))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const qcId = new URL(req.url).searchParams.get("qc_score_id");
  const v = validateEntityId(qcId, "uuid");
  if (!v.ok)
    return Response.json({ error: "qc_score_id ไม่ถูกต้อง (UUID)" }, { status: 400 });
  try {
    const rows = await query`
      SELECT q.id, q.case_ref, q.conversation_id, q.line_user_id,
             q.customer_message_id, q.admin_message_id,
             q.customer_message_ids, q.admin_message_ids,
             q.customer_source_keys, q.admin_source_keys,
             q.response_seconds, q.created_at, q.final_score,
             c.external_chat_key, lc.display_name AS customer_name
      FROM qc_scores q
      LEFT JOIN conversations c ON c.id = q.conversation_id
      LEFT JOIN line_customers lc ON lc.line_user_id = q.line_user_id
      WHERE q.id = ${v.value}::uuid`;
    const qc = rows[0];
    if (!qc) return Response.json({ error: "ไม่พบ qc_score นี้" }, { status: 404 });

    // ดึงข้อความจริงทุกใบของคู่ (ids จาก jsonb; fallback = single ids)
    const custIds = Array.isArray(qc.customer_message_ids) ? qc.customer_message_ids : qc.customer_message_id ? [qc.customer_message_id] : [];
    const adminIds = Array.isArray(qc.admin_message_ids) ? qc.admin_message_ids : qc.admin_message_id ? [qc.admin_message_id] : [];
    const allIds = [...custIds, ...adminIds];
    const msgs = allIds.length
      ? await query`SELECT id, direction, message_text, message_type, created_at, source_message_key
          FROM messages WHERE id = ANY(${allIds}) ORDER BY created_at`
      : [];
    const pick = (ids) => ids.map((id) => msgs.find((m) => m.id === id)).filter(Boolean)
      .map((m) => ({ id: m.id, text: m.message_text, created_at: m.created_at, message_type: m.message_type, source_message_key: m.source_message_key }));
    const customer_items = pick(custIds);
    const admin_items = pick(adminIds);

    return Response.json({
      ok: true,
      qc_score_id: qc.id,
      case_ref: qc.case_ref,
      conversation_id: qc.conversation_id,
      line_user_id: qc.line_user_id,
      external_chat_key: qc.external_chat_key,
      customer_name: qc.customer_name,
      final_score: qc.final_score,
      response_seconds: qc.response_seconds,
      customer_message_id: qc.customer_message_id,
      admin_message_id: qc.admin_message_id,
      customer_message_ids: custIds,
      admin_message_ids: adminIds,
      customer_source_keys: qc.customer_source_keys,
      admin_source_keys: qc.admin_source_keys,
      customer_items,
      admin_items,
      customer_text: customer_items.map((m) => m.text).join("\n") || null,
      admin_text: admin_items.map((m) => m.text).join("\n") || null,
      customer_created_at: customer_items[customer_items.length - 1]?.created_at || null,
      admin_created_at: admin_items[0]?.created_at || null,
    });
  } catch (e) {
    console.error("[recapture-info]", e.message);
    return Response.json({ error: "โหลดข้อมูลเคสไม่สำเร็จ" }, { status: 500 });
  }
}

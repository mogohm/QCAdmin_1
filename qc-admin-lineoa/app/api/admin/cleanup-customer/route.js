import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// ลบลูกค้า 1 รายพร้อมข้อมูลที่อ้างอิงทั้งหมด (FK-safe order)
// ใช้ครั้งเดียวเพื่อล้าง customer ปลอมที่เกิดจากบั๊ก URL parse (account id แทน customer id)
// POST body: { line_user_id: "U..." }
export async function POST(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { line_user_id } = await req.json();
  if (!line_user_id) return Response.json({ error: 'line_user_id required' }, { status: 400 });

  // นับก่อนลบ เพื่อรายงานผล
  const convIds = await query`SELECT id FROM conversations WHERE line_user_id = ${line_user_id}`;
  const ids = convIds.map(r => r.id);

  let deleted = { qc_scores: 0, messages: 0, conversations: 0, customer_events: 0, customer_notes: 0, line_customers: 0 };

  if (ids.length) {
    const s = await query`DELETE FROM qc_scores WHERE conversation_id = ANY(${ids}) RETURNING id`;
    deleted.qc_scores = s.length;
    const m = await query`DELETE FROM messages WHERE conversation_id = ANY(${ids}) RETURNING id`;
    deleted.messages = m.length;
  }
  // เผื่อ message ที่ผูก line_user_id ตรงแต่ไม่อยู่ใน conv ข้างบน
  const m2 = await query`DELETE FROM messages WHERE line_user_id = ${line_user_id} RETURNING id`;
  deleted.messages += m2.length;

  const c = await query`DELETE FROM conversations WHERE line_user_id = ${line_user_id} RETURNING id`;
  deleted.conversations = c.length;
  const ev = await query`DELETE FROM customer_events WHERE line_user_id = ${line_user_id} RETURNING id`;
  deleted.customer_events = ev.length;
  const nt = await query`DELETE FROM customer_notes WHERE line_user_id = ${line_user_id} RETURNING id`;
  deleted.customer_notes = nt.length;
  const lc = await query`DELETE FROM line_customers WHERE line_user_id = ${line_user_id} RETURNING line_user_id`;
  deleted.line_customers = lc.length;

  return Response.json({ ok: true, line_user_id, deleted });
}

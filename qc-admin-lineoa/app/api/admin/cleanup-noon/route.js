import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

// ลบข้อความที่ติด timestamp fallback "เที่ยงวัน" (เกิดจากบั๊ก extractTs ดึงเวลาไม่ได้)
// เพื่อ re-scrape ใหม่ให้ได้เวลาจริง — ลบ qc_scores + messages ที่ created_at = <date> 12:00 local (05:00:00Z)
// POST body: { date: "2026-06-07" }  (วันที่ local ของ Yesterday)
export async function POST(req) {
  if (!requireAdmin(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { date } = await req.json();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return Response.json({ error: "date (YYYY-MM-DD) required" }, { status: 400 });

  // เที่ยงวันไทย (UTC+7) = 05:00:00Z ของวันเดียวกัน
  const noonUtc = `${date}T05:00:00.000Z`;

  // หา message ที่เป็น noon-fallback
  const msgs = await query`SELECT id FROM messages WHERE created_at = ${noonUtc}::timestamptz`;
  const ids = msgs.map((m) => m.id);

  let deletedScores = 0,
    deletedMsgs = 0;
  if (ids.length) {
    const s = await query`
      DELETE FROM qc_scores
      WHERE customer_message_id = ANY(${ids}) OR admin_message_id = ANY(${ids})
      RETURNING id`;
    deletedScores = s.length;
    const m = await query`DELETE FROM messages WHERE id = ANY(${ids}) RETURNING id`;
    deletedMsgs = m.length;
  }

  return Response.json({ ok: true, date, noonUtc, deleted: { qc_scores: deletedScores, messages: deletedMsgs } });
}

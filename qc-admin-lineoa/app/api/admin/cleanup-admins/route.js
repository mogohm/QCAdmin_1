import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// ล้าง admin ขยะ (ชื่อไม่ขึ้นต้น "PK") ที่ scraper ดึงผิดมา + ข้อมูลที่ผูกอยู่
// GET  = preview (ดูว่าจะลบใครบ้าง)   POST = ลบจริง
// admin จริงทุกคนขึ้นต้นด้วย PK

async function nonPkAdmins() {
  return query`SELECT id, member_name FROM qc_admins WHERE member_name NOT ILIKE 'PK%'`;
}

export async function GET(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const junk = await nonPkAdmins();
  const ids = junk.map(a => a.id);
  let msgs = 0, scores = 0;
  if (ids.length) {
    const [m, s] = await Promise.all([
      query`SELECT count(*)::int n FROM messages WHERE admin_id = ANY(${ids})`,
      query`SELECT count(*)::int n FROM qc_scores WHERE admin_id = ANY(${ids})`,
    ]);
    msgs = m[0].n; scores = s[0].n;
  }
  const keep = await query`SELECT count(*)::int n FROM qc_admins WHERE member_name ILIKE 'PK%'`;
  return Response.json({
    will_delete: { admins: junk.length, messages: msgs, qc_scores: scores },
    keep_pk_admins: keep[0].n,
    names: junk.map(a => a.member_name),
  });
}

export async function POST(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const junk = await nonPkAdmins();
  const ids = junk.map(a => a.id);
  if (!ids.length) return Response.json({ ok: true, deleted: { admins: 0 }, message: 'ไม่มี admin ขยะ' });

  // ลำดับ FK-safe: qc_scores → messages → conversations(null) → qc_admins
  const s = await query`DELETE FROM qc_scores WHERE admin_id = ANY(${ids}) RETURNING id`;
  const m = await query`DELETE FROM messages WHERE admin_id = ANY(${ids}) RETURNING id`;
  await query`UPDATE conversations SET assigned_admin_id = NULL WHERE assigned_admin_id = ANY(${ids})`;
  const a = await query`DELETE FROM qc_admins WHERE id = ANY(${ids}) RETURNING member_name`;

  return Response.json({
    ok: true,
    deleted: { admins: a.length, messages: m.length, qc_scores: s.length },
    deleted_names: a.map(x => x.member_name),
  });
}

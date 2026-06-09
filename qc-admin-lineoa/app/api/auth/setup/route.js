import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { hashPassword } from '@/lib/session';
import { normalizeAdminName } from '@/lib/admin-name';

// สร้างตาราง app_users + seed บัญชี (เรียกครั้งเดียวด้วย x-api-key)
//   POST /api/admin/.. → ใช้ requireAdmin
// บัญชีเริ่มต้น: manager/manager123, marketing/marketing123,
//   admin ทุก PK: username = slug ของชื่อ, password = pk1234
export async function POST(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    await query`CREATE TABLE IF NOT EXISTS app_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      display_name TEXT,
      qc_admin_id UUID,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )`;

    const seeded = [];
    const upsert = async (username, pw, role, display_name, qc_admin_id = null) => {
      await query`INSERT INTO app_users (username, password_hash, role, display_name, qc_admin_id)
                  VALUES (${username}, ${hashPassword(pw)}, ${role}, ${display_name}, ${qc_admin_id})
                  ON CONFLICT (username) DO UPDATE SET role=EXCLUDED.role, display_name=EXCLUDED.display_name,
                        qc_admin_id=EXCLUDED.qc_admin_id`;
      seeded.push({ username, role });
    };

    await upsert('manager', 'manager123', 'manager', 'ผู้จัดการ');
    await upsert('marketing', 'marketing123', 'marketing', 'ทีมการตลาด');

    // admin accounts จาก PK admins
    const admins = await query`SELECT id, member_name FROM qc_admins WHERE is_active = true`;
    const used = new Set();
    for (const a of admins) {
      let slug = normalizeAdminName(a.member_name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pk';
      let u = slug, i = 1;
      while (used.has(u)) u = `${slug}-${++i}`;
      used.add(u);
      await upsert(u, 'pk1234', 'admin', a.member_name, a.id);
    }

    return Response.json({ ok: true, accounts: seeded.length, admins: admins.length,
      note: 'manager/manager123, marketing/marketing123, admin=slug/pk1234' });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ดูรายชื่อ user (debug)
export async function GET(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const users = await query`SELECT username, role, display_name FROM app_users ORDER BY role, username`.catch(() => []);
  return Response.json({ users });
}

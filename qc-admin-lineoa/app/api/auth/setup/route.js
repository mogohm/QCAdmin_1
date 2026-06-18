import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/session";
import { normalizeAdminName } from "@/lib/admin-name";
import { ALL_PERMISSIONS, ROLE_PERMS, ROLES } from "@/lib/permissions";

// POST /api/auth/setup (x-api-key) — สร้างตาราง RBAC + seed roles/permissions/users (idempotent)
export async function POST(req) {
  if (!requireAdmin(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    await query`CREATE TABLE IF NOT EXISTS app_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      display_name TEXT,
      qc_admin_id UUID,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )`;
    await query`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT`;
    await query`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`;
    await query`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS linked_admin_id UUID`;
    await query`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`;
    await query`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`;

    await query`CREATE TABLE IF NOT EXISTS roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      role_key TEXT UNIQUE NOT NULL, role_name TEXT NOT NULL, description TEXT,
      is_system BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`;
    await query`CREATE TABLE IF NOT EXISTS permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      permission_key TEXT UNIQUE NOT NULL, permission_name TEXT, description TEXT, module TEXT)`;
    await query`CREATE TABLE IF NOT EXISTS role_permissions (
      role_key TEXT NOT NULL, permission_key TEXT NOT NULL, PRIMARY KEY(role_key, permission_key))`;
    await query`CREATE TABLE IF NOT EXISTS user_registration_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL, password_hash TEXT NOT NULL, display_name TEXT, email TEXT,
      requested_role TEXT, linked_admin_name TEXT, note TEXT,
      status TEXT DEFAULT 'pending', reviewed_by TEXT, reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now())`;
    await query`CREATE TABLE IF NOT EXISTS user_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_user_id TEXT, target_user_id TEXT, action TEXT, detail JSONB,
      created_at TIMESTAMPTZ DEFAULT now())`;

    for (const r of ROLES) {
      await query`INSERT INTO roles (role_key, role_name, is_system) VALUES (${r.role_key}, ${r.role_name}, ${r.is_system})
                  ON CONFLICT (role_key) DO UPDATE SET role_name=EXCLUDED.role_name`;
    }
    for (const p of ALL_PERMISSIONS) {
      await query`INSERT INTO permissions (permission_key, permission_name, module) VALUES (${p}, ${p}, ${p.split(".")[0]})
                  ON CONFLICT (permission_key) DO NOTHING`;
    }
    for (const [role, perms] of Object.entries(ROLE_PERMS)) {
      for (const p of perms) {
        await query`INSERT INTO role_permissions (role_key, permission_key) VALUES (${role}, ${p}) ON CONFLICT DO NOTHING`;
      }
    }

    const seeded = [];
    const upsert = async (username, pw, role, display_name, qc_admin_id = null) => {
      await query`INSERT INTO app_users (username, password_hash, role, display_name, qc_admin_id, status)
                  VALUES (${username}, ${hashPassword(pw)}, ${role}, ${display_name}, ${qc_admin_id}, 'active')
                  ON CONFLICT (username) DO UPDATE SET role=EXCLUDED.role, display_name=EXCLUDED.display_name`;
      seeded.push({ username, role });
    };
    await upsert("sysadmin", "sysadmin123", "system_admin", "ผู้ดูแลระบบ");
    await upsert("manager", "manager123", "manager", "ผู้จัดการ");
    await upsert("leader", "leader123", "leader", "หัวหน้าทีม");
    await upsert("marketing", "marketing123", "marketing", "ทีมการตลาด");

    const admins = await query`SELECT id, member_name FROM qc_admins WHERE is_active = true`;
    const used = new Set();
    for (const a of admins) {
      let slug =
        normalizeAdminName(a.member_name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "pk";
      let u = slug,
        i = 1;
      while (used.has(u)) u = `${slug}-${++i}`;
      used.add(u);
      await upsert(u, "pk1234", "admin", a.member_name, a.id);
    }

    return Response.json({
      ok: true,
      accounts: seeded.length,
      admins: admins.length,
      roles: ROLES.length,
      permissions: ALL_PERMISSIONS.length,
      note: "sysadmin/sysadmin123 · manager/manager123 · leader/leader123 · marketing/marketing123 · admin=slug/pk1234 — เปลี่ยนรหัสก่อนใช้จริง",
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req) {
  if (!requireAdmin(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const users =
    await query`SELECT username, role, display_name, status, last_login_at FROM app_users ORDER BY role, username`.catch(
      () => [],
    );
  return Response.json({ users });
}

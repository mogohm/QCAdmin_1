import { query } from "@/lib/db";
import { hashPassword } from "@/lib/session";
import { guard, getCurrentUser, ROLE_PERMS } from "@/lib/permissions";

async function audit(actor, target, action, detail) {
  await query`INSERT INTO user_audit_logs (actor_user_id, target_user_id, action, detail)
              VALUES (${actor || null}, ${target || null}, ${action}, ${JSON.stringify(detail || {})})`.catch(() => {});
}

// GET /api/system/users — รายชื่อผู้ใช้ (filter q/role/status)
export async function GET(req) {
  const g = guard(req, "system.users.view");
  if (g) return g;
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const role = searchParams.get("role");
  const status = searchParams.get("status");
  const rows = await query`
    SELECT u.id, u.username, u.display_name, u.email, u.role, u.status, u.is_active, u.last_login_at,
           u.qc_admin_id, a.member_name AS linked_admin
    FROM app_users u LEFT JOIN qc_admins a ON a.id = u.qc_admin_id
    WHERE (${q}::text = '' OR u.username ILIKE ${"%" + q + "%"} OR u.display_name ILIKE ${"%" + q + "%"} OR u.email ILIKE ${"%" + q + "%"})
      AND (${role}::text IS NULL OR u.role = ${role})
      AND (${status}::text IS NULL OR u.status = ${status})
    ORDER BY u.role, u.username LIMIT 500`.catch((e) => ({ error: e.message }));
  if (rows.error) return Response.json({ error: rows.error }, { status: 500 });
  return Response.json({ users: rows, roles: Object.keys(ROLE_PERMS) });
}

// POST /api/system/users — สร้างผู้ใช้
export async function POST(req) {
  const g = guard(req, "system.users.create");
  if (g) return g;
  const me = getCurrentUser(req);
  const b = await req.json().catch(() => ({}));
  const username = String(b.username || "")
    .toLowerCase()
    .trim();
  if (!username || !b.password || !b.role)
    return Response.json({ error: "username, password, role required" }, { status: 400 });
  if (!ROLE_PERMS[b.role]) return Response.json({ error: "role ไม่ถูกต้อง" }, { status: 400 });
  try {
    const rows =
      await query`INSERT INTO app_users (username, password_hash, role, display_name, email, linked_admin_id, qc_admin_id, status)
      VALUES (${username}, ${hashPassword(b.password)}, ${b.role}, ${b.display_name || null}, ${b.email || null},
              ${b.linked_admin_id || null}, ${b.linked_admin_id || null}, ${b.status || "active"})
      RETURNING id, username, role, status`;
    await audit(me?.uid, rows[0].id, "user.create", { username, role: b.role });
    return Response.json({ ok: true, user: rows[0] });
  } catch (e) {
    return Response.json({ error: /unique/i.test(e.message) ? "username นี้มีอยู่แล้ว" : e.message }, { status: 500 });
  }
}

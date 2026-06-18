import { query } from "@/lib/db";
import { guard, getCurrentUser, ALL_PERMISSIONS } from "@/lib/permissions";

async function audit(actor, action, detail) {
  await query`INSERT INTO user_audit_logs (actor_user_id, action, detail) VALUES (${actor || null}, ${action}, ${JSON.stringify(detail || {})})`.catch(
    () => {},
  );
}

// PATCH /api/system/roles/:role_key — บันทึก permissions ของ role (replace ทั้งชุด)
//   หมายเหตุ: system_admin ถูกบังคับให้มีทุกสิทธิ์เสมอ (แก้ไม่ได้)
export async function PATCH(req, { params }) {
  const g = guard(req, "system.roles.manage");
  if (g) return g;
  const me = getCurrentUser(req);
  const { role_key } = await params;
  const b = await req.json().catch(() => ({}));
  if (role_key === "system_admin")
    return Response.json({ error: "system_admin มีทุกสิทธิ์เสมอ แก้ไม่ได้" }, { status: 400 });
  const perms = (b.permissions || []).filter((p) => ALL_PERMISSIONS.includes(p));
  try {
    await query`DELETE FROM role_permissions WHERE role_key = ${role_key}`;
    for (const p of perms) {
      await query`INSERT INTO role_permissions (role_key, permission_key) VALUES (${role_key}, ${p}) ON CONFLICT DO NOTHING`;
    }
    await audit(me?.uid, "role.permissions.update", { role_key, count: perms.length });
    return Response.json({ ok: true, role_key, permissions: perms });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

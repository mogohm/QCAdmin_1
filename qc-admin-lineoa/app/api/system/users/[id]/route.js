import { query } from "@/lib/db";
import { hashPassword } from "@/lib/session";
import { guard, getCurrentUser, ROLE_PERMS } from "@/lib/permissions";

async function audit(actor, target, action, detail) {
  await query`INSERT INTO user_audit_logs (actor_user_id, target_user_id, action, detail)
              VALUES (${actor || null}, ${target || null}, ${action}, ${JSON.stringify(detail || {})})`.catch(() => {});
}

// PATCH /api/system/users/:id — แก้ไข/รีเซ็ตรหัส/ปิด-เปิด/assign role/link admin
//   body: { action?: 'reset'|'disable'|'enable', display_name, email, role, linked_admin_id, new_password }
export async function PATCH(req, { params }) {
  const g = guard(req, "system.users.update", "system.users.disable");
  if (g) return g;
  const me = getCurrentUser(req);
  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  try {
    const cur = await query`SELECT id, username, role, status FROM app_users WHERE id = ${id}`;
    if (!cur[0]) return Response.json({ error: "not found" }, { status: 404 });

    // กันปิด system_admin คนสุดท้าย / ปิดบัญชีตัวเอง
    if ((b.action === "disable" || b.status === "disabled") && cur[0].role === "system_admin") {
      if (me?.uid === cur[0].id) return Response.json({ error: "ปิดบัญชีตัวเองไม่ได้" }, { status: 400 });
      const actives =
        await query`SELECT count(*)::int n FROM app_users WHERE role='system_admin' AND status='active' AND id <> ${id}`;
      if ((actives[0]?.n || 0) === 0)
        return Response.json({ error: "ปิด system_admin คนสุดท้ายไม่ได้" }, { status: 400 });
    }

    if (b.action === "reset" || b.new_password) {
      const pw = b.new_password || Math.random().toString(36).slice(2, 10);
      await query`UPDATE app_users SET password_hash = ${hashPassword(pw)}, updated_at = now() WHERE id = ${id}`;
      await audit(me?.uid, id, "user.reset_password", {});
      return Response.json({ ok: true, temp_password: b.new_password ? undefined : pw });
    }
    if (b.action === "disable") {
      await query`UPDATE app_users SET status='disabled', is_active=false, updated_at=now() WHERE id = ${id}`;
      await audit(me?.uid, id, "user.disable", {});
      return Response.json({ ok: true, status: "disabled" });
    }
    if (b.action === "enable") {
      await query`UPDATE app_users SET status='active', is_active=true, updated_at=now() WHERE id = ${id}`;
      await audit(me?.uid, id, "user.enable", {});
      return Response.json({ ok: true, status: "active" });
    }
    if (b.role && !ROLE_PERMS[b.role]) return Response.json({ error: "role ไม่ถูกต้อง" }, { status: 400 });
    const rows = await query`UPDATE app_users SET
        display_name = COALESCE(${b.display_name ?? null}, display_name),
        email = COALESCE(${b.email ?? null}, email),
        role = COALESCE(${b.role ?? null}, role),
        linked_admin_id = COALESCE(${b.linked_admin_id ?? null}, linked_admin_id),
        qc_admin_id = COALESCE(${b.linked_admin_id ?? null}, qc_admin_id),
        status = COALESCE(${b.status ?? null}, status),
        updated_at = now()
      WHERE id = ${id} RETURNING id, username, role, status, display_name`;
    await audit(me?.uid, id, "user.update", { fields: Object.keys(b) });
    return Response.json({ ok: true, user: rows[0] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

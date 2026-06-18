import { query } from "@/lib/db";
import { guard, getCurrentUser, ROLE_PERMS } from "@/lib/permissions";

async function audit(actor, target, action, detail) {
  await query`INSERT INTO user_audit_logs (actor_user_id, target_user_id, action, detail)
              VALUES (${actor || null}, ${target || null}, ${action}, ${JSON.stringify(detail || {})})`.catch(() => {});
}

// PATCH /api/system/registration-requests/:id — { action:'approve'|'reject', role?, linked_admin_id? }
export async function PATCH(req, { params }) {
  const g = guard(req, "system.users.create");
  if (g) return g;
  const me = getCurrentUser(req);
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  try {
    const r = (await query`SELECT * FROM user_registration_requests WHERE id = ${id}`)[0];
    if (!r) return Response.json({ error: "not found" }, { status: 404 });
    if (r.status !== "pending") return Response.json({ error: "คำขอนี้ถูกดำเนินการแล้ว" }, { status: 409 });

    if (b.action === "approve") {
      const role = ROLE_PERMS[b.role] ? b.role : r.requested_role;
      const exists = await query`SELECT 1 FROM app_users WHERE username = ${r.username}`;
      if (exists[0]) return Response.json({ error: "username นี้มีผู้ใช้แล้ว" }, { status: 409 });
      await query`INSERT INTO app_users (username, password_hash, role, display_name, email, linked_admin_id, qc_admin_id, status)
        VALUES (${r.username}, ${r.password_hash}, ${role}, ${r.display_name}, ${r.email}, ${b.linked_admin_id || null}, ${b.linked_admin_id || null}, 'active')`;
      await query`UPDATE user_registration_requests SET status='approved', reviewed_by=${me?.name || "system"}, reviewed_at=now() WHERE id = ${id}`;
      await audit(me?.uid, null, "registration.approve", { username: r.username, role });
      return Response.json({ ok: true, approved: r.username, role });
    }
    if (b.action === "reject") {
      await query`UPDATE user_registration_requests SET status='rejected', reviewed_by=${me?.name || "system"}, reviewed_at=now() WHERE id = ${id}`;
      await audit(me?.uid, null, "registration.reject", { username: r.username });
      return Response.json({ ok: true, rejected: r.username });
    }
    return Response.json({ error: "action ต้องเป็น approve หรือ reject" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

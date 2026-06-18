import { query } from "@/lib/db";
import { hashPassword } from "@/lib/session";

const ALLOWED_ROLES = ["admin", "leader", "manager", "marketing"];

// POST /api/auth/register — สร้างคำขอสมัคร (status pending, ต้องรออนุมัติ)
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const username = String(b.username || "")
    .toLowerCase()
    .trim();
  if (!username || !b.password) return Response.json({ error: "กรอก username/password" }, { status: 400 });
  if (b.password !== b.confirm_password && b.confirm_password !== undefined)
    return Response.json({ error: "รหัสผ่านไม่ตรงกัน" }, { status: 400 });
  if (String(b.password).length < 6) return Response.json({ error: "รหัสผ่านอย่างน้อย 6 ตัว" }, { status: 400 });
  const role = ALLOWED_ROLES.includes(b.requested_role) ? b.requested_role : "admin";

  try {
    await query`CREATE TABLE IF NOT EXISTS user_registration_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL, password_hash TEXT NOT NULL, display_name TEXT, email TEXT,
      requested_role TEXT, linked_admin_name TEXT, note TEXT,
      status TEXT DEFAULT 'pending', reviewed_by TEXT, reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now())`;

    // กันซ้ำกับ user ที่มีอยู่ / คำขอ pending เดิม
    const exists = await query`SELECT 1 FROM app_users WHERE username = ${username}`.catch(() => []);
    if (exists[0]) return Response.json({ error: "username นี้มีอยู่แล้ว" }, { status: 409 });
    const dupReq =
      await query`SELECT 1 FROM user_registration_requests WHERE username = ${username} AND status = 'pending'`.catch(
        () => [],
      );
    if (dupReq[0]) return Response.json({ error: "มีคำขอ pending ของ username นี้อยู่แล้ว" }, { status: 409 });

    const rows = await query`INSERT INTO user_registration_requests
      (username, password_hash, display_name, email, requested_role, linked_admin_name, note, status)
      VALUES (${username}, ${hashPassword(b.password)}, ${b.display_name || null}, ${b.email || null},
              ${role}, ${b.linked_admin_name || null}, ${b.note || null}, 'pending')
      RETURNING id, username, requested_role, status`;
    return Response.json({ ok: true, request: rows[0], message: "ส่งคำขอแล้ว รอผู้ดูแลระบบอนุมัติ" });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

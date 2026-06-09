import { query } from '@/lib/db';
import { sign, verifyPassword, cookieHeader } from '@/lib/session';

export async function POST(req) {
  const { username, password } = await req.json().catch(() => ({}));
  if (!username || !password) return Response.json({ error: 'กรอก username/password' }, { status: 400 });

  const rows = await query`SELECT id, username, password_hash, role, display_name, qc_admin_id
                           FROM app_users WHERE username = ${String(username).toLowerCase().trim()} AND is_active = true`.catch(() => []);
  const u = rows[0];
  if (!u || !verifyPassword(password, u.password_hash))
    return Response.json({ error: 'username หรือ password ไม่ถูกต้อง' }, { status: 401 });

  const token = sign({ uid: u.id, role: u.role, adminId: u.qc_admin_id, name: u.display_name || u.username });
  return new Response(JSON.stringify({ ok: true, role: u.role, display_name: u.display_name, username: u.username }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookieHeader(token) },
  });
}

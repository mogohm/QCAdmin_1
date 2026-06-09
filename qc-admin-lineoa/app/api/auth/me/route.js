import { readSession } from '@/lib/session';

export async function GET(req) {
  const s = readSession(req);
  if (!s) return Response.json({ authenticated: false }, { status: 401 });
  return Response.json({ authenticated: true, role: s.role, adminId: s.adminId || null, name: s.name });
}

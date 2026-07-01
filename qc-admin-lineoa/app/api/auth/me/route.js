import {
  readSession,
  sign,
  cookieHeader,
  REMEMBER_AGE,
  SHORT_AGE,
} from "@/lib/session";
import { permissionsFor, ROLE_HOME } from "@/lib/permissions";

// GET /api/auth/me — สถานะ session ปัจจุบัน + refresh cookie (sliding expiry)
//   ทุกครั้งที่ยัง valid จะต่ออายุ cookie เพื่อกัน mobile เด้ง login ระหว่างใช้งาน
export async function GET(req) {
  const s = readSession(req);
  if (!s) return Response.json({ authenticated: false }, { status: 401 });

  const body = {
    authenticated: true,
    role: s.role,
    adminId: s.adminId || null,
    name: s.name,
    permissions: permissionsFor(s.role),
    home: ROLE_HOME[s.role] || "/",
  };

  // ต่ออายุ session (sliding) — คงค่า remember เดิม
  const maxAge = s.rem ? REMEMBER_AGE : SHORT_AGE;
  const token = sign(
    {
      uid: s.uid,
      role: s.role,
      adminId: s.adminId,
      name: s.name,
      rem: !!s.rem,
    },
    maxAge,
  );
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookieHeader(token, maxAge),
    },
  });
}

// guard — รวมการตรวจสิทธิ์ฝั่ง server ที่ใช้ซ้ำทุก route
//   requireView    : อ่านข้อมูลภายในแอป — ต้องมี session (login) หรือ ADMIN_API_KEY
//   requireManager : อนุมัติ/ตรวจสอบ (dispute, ปรับคะแนน) — manager/admin session หรือ api-key
//   requireEditor  : แก้ไขข้อมูล (SOP, system events) — admin/manager session หรือ api-key
// หมายเหตุ: requireAdmin คืน true เมื่อไม่ได้ตั้ง ADMIN_API_KEY (dev เปิดหมด);
//          บน production ที่ตั้ง key แล้ว route เหล่านี้จะบังคับ session/api-key จริง
import { requireAdmin } from "@/lib/auth";
import { readSession } from "@/lib/session";

export function requireView(req) {
  return !!readSession(req) || requireAdmin(req);
}

export function requireManager(req) {
  const s = readSession(req);
  return (
    (s && (s.role === "manager" || s.role === "admin")) || requireAdmin(req)
  );
}

export function requireEditor(req) {
  const s = readSession(req);
  return (
    (s && (s.role === "admin" || s.role === "manager")) || requireAdmin(req)
  );
}

export function sessionRole(req) {
  return readSession(req)?.role || null;
}

// คืน Response ใหม่ทุกครั้ง (อย่า reuse object เดิม — body stream ถูกใช้ไปแล้ว)
export const unauthorized = (msg = "unauthorized") =>
  Response.json({ error: msg }, { status: 401 });

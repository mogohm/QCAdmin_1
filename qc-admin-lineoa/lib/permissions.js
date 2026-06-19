// permissions.js — RBAC server enforcement (source of truth สำหรับ API ทุกตัว)
//   - pure helpers (hasPermission/canViewRoute/filterMenuByPermissions/ROLE_PERMS/...) มาจาก @/lib/menu
//     (client-safe) แล้ว re-export ที่นี่ เพื่อให้ทั้ง client และ server ใช้ logic ชุดเดียวกัน
//   - server-bound (getCurrentUser/requireAuth/requireRole/requirePermission/guard) อยู่ที่ไฟล์นี้
//   - role_permissions ดึงจาก DB จริง (loadRolePermissions) โดยมี canonical ROLE_PERMS เป็น fallback
//   - system_admin = bypass ทุกสิทธิ์
import { readSession } from "@/lib/session";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  ALL_PERMISSIONS,
  ROLE_PERMS,
  ROLES,
  ROLE_HOME,
  MENU,
  ROUTE_PERMS,
  permissionsFor,
  hasPermission,
  canViewRoute,
  filterMenuByPermissions,
} from "@/lib/menu";

// re-export pure helpers (ให้ import จาก "@/lib/permissions" ได้ครบ)
export {
  ALL_PERMISSIONS,
  ROLE_PERMS,
  ROLES,
  ROLE_HOME,
  MENU,
  ROUTE_PERMS,
  permissionsFor,
  hasPermission,
  canViewRoute,
  filterMenuByPermissions,
};

// ---------- DB-backed role_permissions (real) ----------
// อ่าน role_permissions ของทุก role จาก DB; ถ้า DB ว่าง/ผิดพลาด → fallback canonical ROLE_PERMS
export async function loadRolePermissions() {
  try {
    const rows =
      await query`SELECT role_key, permission_key FROM role_permissions`;
    if (!rows.length) return { ...ROLE_PERMS };
    const map = {};
    for (const r of rows) (map[r.role_key] ||= []).push(r.permission_key);
    // system_admin ต้องมีครบเสมอ
    map.system_admin = [...ALL_PERMISSIONS];
    return map;
  } catch {
    return { ...ROLE_PERMS };
  }
}

// permissions ของ role จาก DB (fallback canonical)
export async function permissionsForDb(role) {
  if (role === "system_admin") return [...ALL_PERMISSIONS];
  const map = await loadRolePermissions();
  return map[role] || permissionsFor(role);
}

// ---------- session / current user ----------
// ผู้ใช้ปัจจุบันจาก session cookie (+ canonical permissions)
export function getCurrentUser(req) {
  const s = readSession(req);
  if (!s) return null;
  return { ...s, permissions: permissionsFor(s.role) };
}

// เหมือน getCurrentUser แต่ดึง permissions จาก DB role_permissions จริง
export async function getCurrentUserDb(req) {
  const s = readSession(req);
  if (!s) return null;
  return { ...s, permissions: await permissionsForDb(s.role) };
}

// คืน user ถ้า login แล้ว, null ถ้ายัง
export function requireAuth(req) {
  return getCurrentUser(req);
}

// true ถ้า role ของ user อยู่ใน roles ที่อนุญาต (system_admin bypass; api-key superuser)
export function requireRole(req, roles) {
  if (req.headers.get("x-api-key") && requireAdmin(req)) return true;
  const u = getCurrentUser(req);
  if (!u) return false;
  if (u.role === "system_admin") return true;
  const allow = Array.isArray(roles) ? roles : [roles];
  return allow.includes(u.role);
}

// true ถ้ามี permission อย่างน้อย 1 ใน keys (api-key superuser = scraper/scripts; system_admin bypass)
export function requirePermission(req, ...keys) {
  if (req.headers.get("x-api-key") && requireAdmin(req)) return true;
  const u = getCurrentUser(req);
  if (!u) return false;
  return hasPermission(u, keys.length === 1 ? keys[0] : keys);
}

export const unauthorized = (msg = "unauthorized") =>
  Response.json({ error: msg }, { status: 401 });
export const forbidden = (msg = "forbidden") =>
  Response.json({ error: msg, code: "forbidden" }, { status: 403 });

// ใช้ใน route handler: const gate = guard(req, "perm.key"); if (gate) return gate;
//   คืน Response 401 (ยังไม่ login) / 403 (ไม่มีสิทธิ์) / null (ผ่าน)
export function guard(req, ...keys) {
  if (req.headers.get("x-api-key") && requireAdmin(req)) return null;
  const u = getCurrentUser(req);
  if (!u) return unauthorized();
  if (u.role === "system_admin") return null;
  return hasPermission(u, keys.length === 1 ? keys[0] : keys)
    ? null
    : forbidden();
}
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

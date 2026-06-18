import { query } from "@/lib/db";
import { guard, ALL_PERMISSIONS, ROLE_PERMS } from "@/lib/permissions";

// GET /api/system/roles — roles + permissions ปัจจุบัน (จาก DB, fallback canonical) + รายการ permission ทั้งหมด
export async function GET(req) {
  const g = guard(req, "system.roles.manage");
  if (g) return g;
  const roles = await query`SELECT role_key, role_name, is_system FROM roles ORDER BY role_key`.catch(() => []);
  const rp = await query`SELECT role_key, permission_key FROM role_permissions`.catch(() => []);
  const byRole = {};
  for (const r of rp) (byRole[r.role_key] ||= []).push(r.permission_key);
  const list = (
    roles.length ? roles : Object.keys(ROLE_PERMS).map((k) => ({ role_key: k, role_name: k, is_system: true }))
  ).map((r) => ({ ...r, permissions: byRole[r.role_key] || ROLE_PERMS[r.role_key] || [] }));
  return Response.json({ roles: list, all_permissions: ALL_PERMISSIONS });
}

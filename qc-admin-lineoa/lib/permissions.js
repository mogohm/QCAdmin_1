// permissions — RBAC source of truth (server-side enforcement)
//   getCurrentUser/requireAuth/requirePermission/hasPermission — ใช้ใน API ทุกตัว
//   ROLE_PERMS เป็น default canonical map; ตาราง role_permissions ใน DB ใช้สำหรับ UI แก้ไข
import { readSession } from "@/lib/session";
import { requireAdmin } from "@/lib/auth";

export const ALL_PERMISSIONS = [
  // dashboard
  "dashboard.executive.view",
  "dashboard.admin.view",
  "dashboard.manager.view",
  "dashboard.leaderboard.view",
  "dashboard.marketing.view",
  // chat
  "chat.view.all",
  "chat.view.own",
  "chat.reply",
  "chat.review",
  // qc
  "qc.monitor.view",
  "qc.score.view",
  "qc.score.override",
  "qc.dispute.create",
  "qc.dispute.review",
  // sop
  "sop.view",
  "sop.create",
  "sop.update",
  "sop.delete",
  "sop.import",
  // scraper
  "scraper.view",
  "scraper.run",
  "scraper.schedule",
  "scraper.report",
  // system
  "system.users.view",
  "system.users.create",
  "system.users.update",
  "system.users.disable",
  "system.roles.manage",
  "system.settings.manage",
  "system.events.manage",
  // commission
  "commission.view.own",
  "commission.view.team",
  "commission.view.all",
  "commission.adjust",
  // marketing
  "marketing.dashboard.view",
  "marketing.events.view",
];

export const ROLE_PERMS = {
  system_admin: [...ALL_PERMISSIONS],
  admin: [
    "dashboard.admin.view",
    "chat.view.own",
    "chat.reply",
    "qc.score.view",
    "qc.dispute.create",
    "commission.view.own",
  ],
  manager: [
    "dashboard.executive.view",
    "dashboard.manager.view",
    "dashboard.leaderboard.view",
    "dashboard.marketing.view",
    "qc.monitor.view",
    "qc.score.view",
    "qc.score.override",
    "qc.dispute.review",
    "chat.view.all",
    "chat.review",
    "sop.view",
    "sop.update",
    "scraper.view",
    "scraper.report",
    "commission.view.team",
    "marketing.dashboard.view",
    "marketing.events.view",
  ],
  leader: [
    "dashboard.manager.view",
    "dashboard.leaderboard.view",
    "chat.view.all",
    "chat.review",
    "qc.monitor.view",
    "qc.score.view",
    "qc.dispute.review",
    "commission.view.team",
  ],
  marketing: ["dashboard.marketing.view", "marketing.dashboard.view", "marketing.events.view", "commission.view.all"],
};

export const ROLES = [
  { role_key: "system_admin", role_name: "System Admin", is_system: true },
  { role_key: "manager", role_name: "Manager", is_system: true },
  { role_key: "leader", role_name: "Leader", is_system: true },
  { role_key: "admin", role_name: "Admin (QC Operator)", is_system: true },
  { role_key: "marketing", role_name: "Marketing", is_system: true },
];

// หน้าแรกหลัง login ตาม role
export const ROLE_HOME = {
  system_admin: "/",
  manager: "/",
  leader: "/admin-performance",
  admin: "/admin-dashboard",
  marketing: "/marketing-dashboard",
};

export function permissionsFor(role) {
  return ROLE_PERMS[role] || [];
}

// ผู้ใช้ปัจจุบันจาก session cookie (+ permissions)
export function getCurrentUser(req) {
  const s = readSession(req);
  if (!s) return null;
  return { ...s, permissions: permissionsFor(s.role) };
}

export function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === "system_admin") return true;
  return permissionsFor(user.role).includes(key);
}

export function requireAuth(req) {
  return getCurrentUser(req); // null ถ้ายังไม่ login
}

// ต้องมี permission อย่างน้อย 1 ใน keys (หรือเป็น api-key superuser = scraper/scripts)
export function requirePermission(req, ...keys) {
  if (req.headers.get("x-api-key") && requireAdmin(req)) return true; // service/scraper
  const u = getCurrentUser(req);
  if (!u) return false;
  if (u.role === "system_admin") return true;
  return keys.some((k) => permissionsFor(u.role).includes(k));
}

export const unauthorized = (msg = "unauthorized") => Response.json({ error: msg }, { status: 401 });
export const forbidden = (msg = "forbidden") => Response.json({ error: msg, code: "forbidden" }, { status: 403 });

// ใช้ใน route: const gate = guard(req, "perm.key"); if (gate) return gate;  (คืน Response 401/403 ถ้าไม่ผ่าน)
export function guard(req, ...keys) {
  if (req.headers.get("x-api-key") && requireAdmin(req)) return null;
  const u = getCurrentUser(req);
  if (!u) return unauthorized();
  if (u.role === "system_admin") return null;
  return keys.some((k) => permissionsFor(u.role).includes(k)) ? null : forbidden();
}

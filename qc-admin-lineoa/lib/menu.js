// menu.js — RBAC pure/isomorphic helpers (ปลอดภัยทั้ง client & server, ไม่มี node crypto)
//   ใช้ร่วมกันโดย Sidebar/AppShell (client) และ lib/permissions.js (server re-export)

// ---- permission catalog (36 keys) ----
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

// ---- canonical role → permissions (source of truth, mirror DB seed) ----
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
  marketing: [
    "dashboard.marketing.view",
    "marketing.dashboard.view",
    "marketing.events.view",
    "commission.view.all",
  ],
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

// ---- เมนู: { href, icon, label, perm: string|string[]|null } (null = ทุกคนที่ login) ----
export const MENU = [
  {
    href: "/",
    icon: "📊",
    label: "แดชบอร์ดผู้บริหาร",
    perm: "dashboard.executive.view",
  },
  {
    href: "/admin-dashboard",
    icon: "🧑‍💼",
    label: "แดชบอร์ดแอดมิน",
    perm: "dashboard.admin.view",
  },
  {
    href: "/manager-dashboard",
    icon: "📈",
    label: "แดชบอร์ดผู้จัดการ",
    perm: "dashboard.manager.view",
  },
  {
    href: "/leaderboard",
    icon: "🏆",
    label: "จัดอันดับแอดมิน",
    perm: "dashboard.leaderboard.view",
  },
  {
    href: "/marketing-dashboard",
    icon: "📣",
    label: "แดชบอร์ดการตลาด",
    perm: "dashboard.marketing.view",
  },
  {
    href: "/qc-dashboard",
    icon: "🎯",
    label: "ตรวจสอบคุณภาพ",
    perm: "qc.monitor.view",
  },
  {
    href: "/chat-review",
    icon: "💬",
    label: "รีวิวแชท",
    perm: ["chat.view.all", "chat.view.own", "chat.review"],
  },
  { href: "/sop", icon: "📚", label: "คลังความรู้ SOP", perm: "sop.view" },
  {
    href: "/disputes",
    icon: "⚖️",
    label: "โต้แย้งคะแนน",
    perm: ["qc.dispute.review", "qc.dispute.create"],
  },
  {
    href: "/ai-review",
    icon: "🤖",
    label: "คิวตรวจสอบ AI",
    perm: ["qc.dispute.review", "qc.score.override"],
  },
  {
    href: "/manual-case",
    icon: "✍️",
    label: "เพิ่มเคสเอง",
    perm: ["qc.score.override", "qc.monitor.view"],
  },
  {
    href: "/knowledge-training",
    icon: "🧠",
    label: "สอนความรู้ให้ AI",
    perm: ["sop.create", "sop.update"],
  },
  {
    href: "/system-events",
    icon: "🛠️",
    label: "เหตุการณ์ระบบ",
    perm: "system.events.manage",
  },
  {
    href: "/admin-performance",
    icon: "🏅",
    label: "ผลงานแอดมิน",
    perm: ["dashboard.manager.view", "dashboard.admin.view"],
  },
  {
    href: "/commission",
    icon: "💰",
    label: "ค่าคอมมิชชั่น",
    perm: [
      "commission.view.own",
      "commission.view.team",
      "commission.view.all",
    ],
  },
  {
    href: "/scraper",
    icon: "🛰️",
    label: "ตัวดึงข้อมูล LINE OA",
    perm: "scraper.view",
  },
  {
    href: "/system/users",
    icon: "👥",
    label: "จัดการผู้ใช้และสิทธิ์",
    perm: "system.users.view",
  },
  {
    href: "/system/roles",
    icon: "🔐",
    label: "สิทธิ์ของแต่ละบทบาท",
    perm: "system.roles.manage",
  },
  {
    href: "/system/registration-requests",
    icon: "📝",
    label: "คำขอลงทะเบียน",
    perm: "system.users.create",
  },
  { href: "/docs", icon: "📄", label: "คู่มือใช้งาน", perm: null },
];

// route prefix → required permission (สำหรับ canViewRoute; รวม route ที่ไม่อยู่ในเมนู)
export const ROUTE_PERMS = {
  ...Object.fromEntries(MENU.map((m) => [m.href, m.perm])),
  "/chat": ["chat.view.all", "chat.view.own", "chat.review"],
  "/customer": ["chat.view.all", "chat.view.own", "chat.review"],
  "/rules": "system.settings.manage",
  "/forbidden": null,
};

export function permissionsFor(role) {
  return ROLE_PERMS[role] || [];
}

// user = { role, permissions? } — ถ้ามี permissions array ใช้ตัวนั้น (เช่นจาก DB), ไม่งั้น fallback canonical
function permsOf(user) {
  if (!user) return [];
  if (Array.isArray(user.permissions)) return user.permissions;
  return permissionsFor(user.role);
}

function need(permList) {
  if (permList == null) return null; // ทุกคนที่ login
  return Array.isArray(permList) ? permList : [permList];
}

// มีสิทธิ์ key หรือไม่ (system_admin = bypass all)
export function hasPermission(user, permissionKey) {
  if (!user) return false;
  if (user.role === "system_admin") return true;
  if (!permissionKey) return true;
  const keys = Array.isArray(permissionKey) ? permissionKey : [permissionKey];
  const have = permsOf(user);
  return keys.some((k) => have.includes(k));
}

// เข้าหน้า route นี้ได้ไหม
export function canViewRoute(user, route) {
  if (!user) return false;
  if (user.role === "system_admin") return true;
  // หา prefix ที่ยาวสุดที่ตรง
  const match = Object.keys(ROUTE_PERMS)
    .filter((p) =>
      p === "/" ? route === "/" : route === p || route.startsWith(p + "/"),
    )
    .sort((a, b) => b.length - a.length)[0];
  if (match === undefined) return true; // route ที่ไม่ระบุ = ให้ผ่าน (มี session แล้ว)
  const req = need(ROUTE_PERMS[match]);
  if (req == null) return true;
  const have = permsOf(user);
  return req.some((k) => have.includes(k));
}

// กรองเมนูตามสิทธิ์ — ใช้โดย Sidebar/AppShell
export function filterMenuByPermissions(user, menuItems = MENU) {
  if (!user) return [];
  return menuItems.filter((item) => hasPermission(user, item.perm));
}
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

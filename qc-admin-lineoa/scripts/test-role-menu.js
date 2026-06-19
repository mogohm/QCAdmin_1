// test-role-menu.js — ทดสอบ filterMenuByPermissions() + canViewRoute() ของจริงจาก lib/menu.js
//   (import โมดูลจริง ไม่ mirror) + cross-check กับ /api/auth/me ถ้าเข้าถึง prod ได้
import { MENU, ROLE_PERMS, filterMenuByPermissions, canViewRoute } from "../lib/menu.js";

let pass = 0,
  fail = 0;
const ok = (n, c, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`);
};

// สร้าง user สังเคราะห์ตาม canonical ROLE_PERMS
const user = (role) => ({ role, authenticated: true, permissions: ROLE_PERMS[role] || [] });
const hrefs = (role) => filterMenuByPermissions(user(role), MENU).map((m) => m.href);
const sees = (role, href) => hrefs(role).includes(href);

console.log("== role menu (unit: filterMenuByPermissions + canViewRoute ของจริง) ==");

// ---- filterMenuByPermissions ----
ok("system_admin เห็นทุกเมนู", filterMenuByPermissions(user("system_admin"), MENU).length === MENU.length);
ok("user = null → เมนูว่าง", filterMenuByPermissions(null, MENU).length === 0);
ok("เมนู perm=null (Docs) แสดงให้ทุก role", sees("marketing", "/docs"));

// admin — ไม่เห็น system users / roles / SOP / scraper
ok("admin ไม่เห็น /system/users", !sees("admin", "/system/users"));
ok("admin ไม่เห็น /system/roles", !sees("admin", "/system/roles"));
ok("admin ไม่เห็น /sop (SOP edit)", !sees("admin", "/sop"));
ok("admin ไม่เห็น /scraper (scraper schedule)", !sees("admin", "/scraper"));
ok("admin เห็น /admin-dashboard", sees("admin", "/admin-dashboard"));

// manager — executive, manager, disputes, sop, admin-performance
ok("manager เห็น / (executive)", sees("manager", "/"));
ok("manager เห็น /manager-dashboard", sees("manager", "/manager-dashboard"));
ok("manager เห็น /disputes", sees("manager", "/disputes"));
ok("manager เห็น /sop (view/update)", sees("manager", "/sop"));
ok("manager เห็น /admin-performance", sees("manager", "/admin-performance"));

// leader — manager dashboard, leaderboard, chat review, admin performance
ok("leader เห็น /manager-dashboard", sees("leader", "/manager-dashboard"));
ok("leader เห็น /leaderboard", sees("leader", "/leaderboard"));
ok("leader เห็น /chat-review", sees("leader", "/chat-review"));
ok("leader เห็น /admin-performance", sees("leader", "/admin-performance"));
ok("leader ไม่เห็น /sop", !sees("leader", "/sop"));

// marketing — marketing dashboard เท่านั้น (+docs/commission), ไม่เห็น chat/sop/system
ok("marketing เห็น /marketing-dashboard", sees("marketing", "/marketing-dashboard"));
ok("marketing ไม่เห็น /chat-review", !sees("marketing", "/chat-review"));
ok("marketing ไม่เห็น /sop", !sees("marketing", "/sop"));
ok("marketing ไม่เห็น /system/users", !sees("marketing", "/system/users"));
ok("marketing ไม่เห็น / (executive)", !sees("marketing", "/"));

// ---- canViewRoute ----
ok("canViewRoute(sysadmin, /system/roles) = true", canViewRoute(user("system_admin"), "/system/roles"));
ok("canViewRoute(null, /) = false", !canViewRoute(null, "/"));
ok("canViewRoute(admin, /system/users) = false", !canViewRoute(user("admin"), "/system/users"));
ok("canViewRoute(admin, /admin-dashboard) = true", canViewRoute(user("admin"), "/admin-dashboard"));
ok("canViewRoute(marketing, /chat/Uxxx) = false", !canViewRoute(user("marketing"), "/chat/Uxxxx"));
ok("canViewRoute(manager, /chat/Uxxx) = true", canViewRoute(user("manager"), "/chat/Uxxxx"));
ok("canViewRoute(marketing, /sop) = false", !canViewRoute(user("marketing"), "/sop"));

// ---- live cross-check (ถ้าเข้า prod ได้): /api/auth/me.permissions ต้องตรง ROLE_PERMS ----
const BASE = (process.env.AUTH_BASE || process.env.APP_BASE_URL || "").replace(/\/$/, "");
if (BASE) {
  const me = async (u, p) => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p }),
    });
    const sc = r.headers.get("set-cookie");
    if (!sc) return null;
    return fetch(`${BASE}/api/auth/me`, { headers: { Cookie: sc.split(";")[0] } }).then((x) => x.json());
  };
  for (const [u, p, role] of [
    ["manager", "manager123", "manager"],
    ["leader", "leader123", "leader"],
    ["marketing", "marketing123", "marketing"],
  ]) {
    const m = await me(u, p);
    if (m?.permissions) {
      const sameSet = m.permissions.slice().sort().join(",") === ROLE_PERMS[role].slice().sort().join(",");
      ok(`live: /api/auth/me(${u}) permissions ตรง ROLE_PERMS`, sameSet);
    }
  }
}

console.log(`\n===== Role menu: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
process.exit(fail ? 1 : 0);
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

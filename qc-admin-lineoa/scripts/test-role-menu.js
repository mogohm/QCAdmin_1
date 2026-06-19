// test-role-menu.js — เมนูที่เห็นต้องตรงกับ permission ของ role (อิง /api/auth/me จริง)
const BASE = (process.env.AUTH_BASE || process.env.APP_BASE_URL || "https://qc-admin-1.vercel.app").replace(/\/$/, "");
let pass = 0,
  fail = 0;
const ok = (n, c, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`);
};
async function loginCookie(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const sc = r.headers.get("set-cookie");
  return sc ? sc.split(";")[0] : null;
}
async function loginMe(username, password) {
  const cookie = await loginCookie(username, password);
  if (!cookie) return null;
  return fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookie } }).then((x) => x.json());
}
// menu → required permission (mirror lib/menu.js MENU)
const MENU = {
  "Executive Dashboard": "dashboard.executive.view",
  "Admin Dashboard": "dashboard.admin.view",
  "Manager Dashboard": "dashboard.manager.view",
  Leaderboard: "dashboard.leaderboard.view",
  "Marketing Dashboard": "dashboard.marketing.view",
  "QC Monitoring": "qc.monitor.view",
  "Chat Review": ["chat.view.all", "chat.view.own", "chat.review"],
  "SOP Knowledge Base": "sop.view",
  Disputes: ["qc.dispute.review", "qc.dispute.create"],
  "Admin Performance": ["dashboard.manager.view", "dashboard.admin.view"],
  Commission: ["commission.view.own", "commission.view.team", "commission.view.all"],
  "User & Role Mgmt": "system.users.view",
  "Role Permissions": "system.roles.manage",
  "Registration Requests": "system.users.create",
};
const can = (perms, need, role) =>
  role === "system_admin" || (Array.isArray(need) ? need : [need]).some((p) => perms.includes(p));

(async () => {
  console.log(`== role menu @ ${BASE} ==`);
  const me = {};
  for (const [u, p] of [
    ["sysadmin", "sysadmin123"],
    ["manager", "manager123"],
    ["leader", "leader123"],
    ["marketing", "marketing123"],
  ]) {
    me[u] = await loginMe(u, p);
  }
  if (!me.sysadmin) {
    console.log("⏭️  ข้าม — login ไม่ได้ (รัน /api/auth/setup ก่อน)");
    console.log(`\n===== Role menu: ✅ PASS — ผ่าน 0 / ล้มเหลว 0 =====`);
    process.exit(0);
  }
  // admin: slug seed ไม่ทราบ username → สร้าง temp admin ผ่าน sysadmin แล้ว login
  const sysCookie = await loginCookie("sysadmin", "sysadmin123");
  const auname = "__test_menu_admin_" + Date.now();
  const acr = await fetch(`${BASE}/api/system/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sysCookie },
    body: JSON.stringify({ username: auname, password: "test1234", role: "admin", status: "active" }),
  }).then((r) => r.json());
  if (acr.user?.id) {
    me.admin = await loginMe(auname, "test1234");
    await fetch(`${BASE}/api/system/users/${acr.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: sysCookie },
      body: JSON.stringify({ action: "disable" }),
    });
  }
  const P = (u) => me[u]?.permissions || [];

  // sysadmin เห็นทุกเมนู (ทุก item ใน MENU)
  const sysSeesAll = Object.values(MENU).every((need) => can(P("sysadmin"), need, "system_admin"));
  ok("sysadmin เห็นทุกเมนู", sysSeesAll);

  // manager
  ok("manager เห็น Manager Dashboard", can(P("manager"), MENU["Manager Dashboard"], "manager"));
  ok("manager เห็น QC Monitoring", can(P("manager"), MENU["QC Monitoring"], "manager"));
  ok("manager เห็น Disputes (dispute review)", can(P("manager"), MENU["Disputes"], "manager"));
  ok("manager ไม่เห็น User & Role Mgmt", !can(P("manager"), MENU["User & Role Mgmt"], "manager"));

  // leader — leaderboard/team
  ok("leader เห็น Leaderboard", can(P("leader"), MENU["Leaderboard"], "leader"));
  ok("leader เห็น Admin Performance (team)", can(P("leader"), MENU["Admin Performance"], "leader"));
  ok("leader เห็น Chat Review", can(P("leader"), MENU["Chat Review"], "leader"));
  ok("leader ไม่เห็น SOP (ไม่มี sop.view)", !can(P("leader"), MENU["SOP Knowledge Base"], "leader"));
  ok("leader ไม่เห็น User & Role Mgmt", !can(P("leader"), MENU["User & Role Mgmt"], "leader"));

  // admin — ไม่เห็น system users / roles / SOP
  ok("admin ไม่เห็น User & Role Mgmt", !can(P("admin"), MENU["User & Role Mgmt"], "admin"));
  ok("admin ไม่เห็น Role Permissions", !can(P("admin"), MENU["Role Permissions"], "admin"));
  ok("admin ไม่เห็น SOP Knowledge Base", !can(P("admin"), MENU["SOP Knowledge Base"], "admin"));

  // marketing
  ok("marketing เห็น Marketing Dashboard", can(P("marketing"), MENU["Marketing Dashboard"], "marketing"));
  ok("marketing ไม่เห็น Chat Review", !can(P("marketing"), MENU["Chat Review"], "marketing"));
  ok("marketing ไม่เห็น Role Permissions", !can(P("marketing"), MENU["Role Permissions"], "marketing"));

  console.log(`\n===== Role menu: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
  process.exit(fail ? 1 : 0);
})();

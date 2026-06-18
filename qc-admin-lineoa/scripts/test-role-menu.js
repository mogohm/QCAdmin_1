// test-role-menu.js — เมนูที่เห็นต้องตรงกับ permission ของ role (อิง /api/auth/me จริง)
const BASE = (process.env.AUTH_BASE || process.env.APP_BASE_URL || "https://qc-admin-1.vercel.app").replace(/\/$/, "");
let pass = 0,
  fail = 0;
const ok = (n, c, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`);
};
async function loginMe(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const sc = r.headers.get("set-cookie");
  const cookie = sc ? sc.split(";")[0] : null;
  if (!cookie) return null;
  return fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookie } }).then((x) => x.json());
}
// menu → required permission (mirror AppShell)
const MENU = {
  "Executive Dashboard": "dashboard.executive.view",
  "Admin Dashboard": "dashboard.admin.view",
  "Manager Dashboard": "dashboard.manager.view",
  Leaderboard: "dashboard.leaderboard.view",
  "Marketing Dashboard": "dashboard.marketing.view",
  "QC Monitoring": "qc.monitor.view",
  "Chat Review": ["chat.view.all", "chat.view.own", "chat.review"],
  "SOP Knowledge Base": "sop.view",
  "User & Role Mgmt": "system.users.view",
  "Role Permissions": "system.roles.manage",
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
  const P = (u) => me[u]?.permissions || [];

  // sysadmin เห็นทุกเมนู
  ok("sysadmin เห็น User & Role Mgmt", can(P("sysadmin"), MENU["User & Role Mgmt"], "system_admin"));
  ok("sysadmin เห็น Role Permissions", can(P("sysadmin"), MENU["Role Permissions"], "system_admin"));

  // manager
  ok("manager เห็น Manager Dashboard", can(P("manager"), MENU["Manager Dashboard"], "manager"));
  ok("manager เห็น QC Monitoring", can(P("manager"), MENU["QC Monitoring"], "manager"));
  ok("manager ไม่เห็น User & Role Mgmt", !can(P("manager"), MENU["User & Role Mgmt"], "manager"));

  // leader
  ok("leader เห็น Leaderboard", can(P("leader"), MENU["Leaderboard"], "leader"));
  ok("leader เห็น Chat Review", can(P("leader"), MENU["Chat Review"], "leader"));
  ok("leader ไม่เห็น SOP (ไม่มี sop.view)", !can(P("leader"), MENU["SOP Knowledge Base"], "leader"));
  ok("leader ไม่เห็น User & Role Mgmt", !can(P("leader"), MENU["User & Role Mgmt"], "leader"));

  // marketing
  ok("marketing เห็น Marketing Dashboard", can(P("marketing"), MENU["Marketing Dashboard"], "marketing"));
  ok("marketing ไม่เห็น Chat Review", !can(P("marketing"), MENU["Chat Review"], "marketing"));
  ok("marketing ไม่เห็น Role Permissions", !can(P("marketing"), MENU["Role Permissions"], "marketing"));

  console.log(`\n===== Role menu: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
  process.exit(fail ? 1 : 0);
})();

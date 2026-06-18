// test-permissions.js — ตรวจการ enforce permission ที่ API จริง (ไม่ใช่แค่ซ่อนเมนู)
const BASE = (process.env.AUTH_BASE || process.env.APP_BASE_URL || "https://qc-admin-1.vercel.app").replace(/\/$/, "");
let pass = 0,
  fail = 0;
const ok = (n, c, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`);
};
async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const sc = r.headers.get("set-cookie");
  return sc ? sc.split(";")[0] : null;
}
const code = async (path, cookie) =>
  (await fetch(`${BASE}${path}`, { headers: cookie ? { Cookie: cookie } : {} })).status;

(async () => {
  console.log(`== permission enforcement @ ${BASE} ==`);

  // ไม่มี session → 401
  ok("no session → /api/dashboard 401", (await code("/api/dashboard")) === 401);
  ok("no session → /api/system/users 401", (await code("/api/system/users")) === 401);

  const sys = await login("sysadmin", "sysadmin123");
  const mgr = await login("manager", "manager123");
  const mkt = await login("marketing", "marketing123");
  if (!sys) {
    console.log("⏭️  ข้าม — login sysadmin ไม่ได้ (รัน /api/auth/setup ก่อน)");
    console.log(`\n===== Permissions: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
    process.exit(fail ? 1 : 0);
  }

  // system_admin
  ok("sysadmin → /api/system/users 200", (await code("/api/system/users", sys)) === 200);
  ok("sysadmin → /api/system/roles 200", (await code("/api/system/roles", sys)) === 200);

  // manager
  ok("manager → /api/qc-disputes 200", (await code("/api/qc-disputes", mgr)) === 200);
  ok("manager → /api/system/users 403 (no system.users.view)", (await code("/api/system/users", mgr)) === 403);

  // marketing — ห้ามดู chat
  ok("marketing → /api/dashboard 200", (await code("/api/dashboard?from=2026-06-01&to=2026-06-30", mkt)) === 200);
  ok("marketing → /api/replies 403 (no chat perm)", (await code("/api/replies", mkt)) === 403);
  ok("marketing → /api/sop 403 (no sop.view)", (await code("/api/sop", mkt)) === 403);

  // admin (สร้างชั่วคราว) — ห้ามจัดการ user, ห้ามดู sop
  const uname = "__test_perm_admin_" + Date.now();
  const cr = await fetch(`${BASE}/api/system/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sys },
    body: JSON.stringify({ username: uname, password: "test1234", role: "admin", status: "active" }),
  }).then((r) => r.json());
  const adminCookie = cr.user?.id ? await login(uname, "test1234") : null;
  if (adminCookie) {
    ok("admin → /api/system/users 403", (await code("/api/system/users", adminCookie)) === 403);
    ok("admin → /api/sop 403 (no sop.view)", (await code("/api/sop", adminCookie)) === 403);
    ok("admin → /api/dashboard 200 (dashboard.admin.view)", (await code("/api/dashboard", adminCookie)) === 200);
    // cleanup
    await fetch(`${BASE}/api/system/users/${cr.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: sys },
      body: JSON.stringify({ action: "disable" }),
    });
  } else {
    ok("create temp admin for perm test", false, cr.error || "no id");
  }

  console.log(`\n===== Permissions: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
  process.exit(fail ? 1 : 0);
})();

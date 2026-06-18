// test-auth-roles.js — login จริง + role + pending/disabled (ยิง API จริง)
//   ตั้ง AUTH_BASE หรือ APP_BASE_URL (default prod). ต้องรัน /api/auth/setup seed ก่อน
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
  return { status: r.status, cookie: sc ? sc.split(";")[0] : null, json: await r.json().catch(() => ({})) };
}

(async () => {
  console.log(`== auth @ ${BASE} ==`);
  ok("no creds → 400", (await login("", "")).status === 400);
  ok("wrong password → 401", (await login("sysadmin", "wrongpw")).status === 401);

  for (const [u, p, role] of [
    ["sysadmin", "sysadmin123", "system_admin"],
    ["manager", "manager123", "manager"],
    ["leader", "leader123", "leader"],
    ["marketing", "marketing123", "marketing"],
  ]) {
    const r = await login(u, p);
    ok(
      `login ${u} → ok + role ${role}`,
      r.status === 200 && r.json.role === role,
      `status ${r.status} role ${r.json.role}`,
    );
  }

  // pending/disabled: สร้าง user ผ่าน sysadmin แล้ว disable → login ต้องโดน 403
  const admin = await login("sysadmin", "sysadmin123");
  if (admin.cookie) {
    const uname = "__test_disabled_" + Date.now();
    const create = await fetch(`${BASE}/api/system/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ username: uname, password: "test1234", role: "admin", status: "active" }),
    }).then((r) => r.json());
    if (create.user?.id) {
      await fetch(`${BASE}/api/system/users/${create.user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: admin.cookie },
        body: JSON.stringify({ action: "disable" }),
      });
      const dl = await login(uname, "test1234");
      ok("disabled user cannot login (403)", dl.status === 403, `status ${dl.status}`);
    } else {
      ok("create test user (skipped pending test)", false, create.error || "no id");
    }
  } else {
    console.log("⏭️  ข้าม disabled test — login sysadmin ไม่ได้ (รัน /api/auth/setup ก่อน)");
  }

  console.log(`\n===== Auth roles: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
  process.exit(fail ? 1 : 0);
})();

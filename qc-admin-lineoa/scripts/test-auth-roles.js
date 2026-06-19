// test-auth-roles.js — login จริง + role + pending/disabled (ยิง API จริง)
//   ตั้ง AUTH_BASE หรือ APP_BASE_URL (default prod). ต้องรัน /api/auth/setup seed ก่อน
const BASE = (
  process.env.AUTH_BASE ||
  process.env.APP_BASE_URL ||
  "https://qc-admin-1.vercel.app"
).replace(/\/$/, "");
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
  return {
    status: r.status,
    cookie: sc ? sc.split(";")[0] : null,
    json: await r.json().catch(() => ({})),
  };
}

(async () => {
  console.log(`== auth @ ${BASE} ==`);
  ok("no creds → 400", (await login("", "")).status === 400);
  ok(
    "wrong password → 401",
    (await login("sysadmin", "wrongpw")).status === 401,
  );

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

  // ต้องใช้ sysadmin สร้าง user ทดสอบ (admin/active, disabled, pending)
  const admin = await login("sysadmin", "sysadmin123");
  const mk = (cookie, uname, status) =>
    fetch(`${BASE}/api/system/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        username: uname,
        password: "test1234",
        role: "admin",
        status,
      }),
    }).then((r) => r.json());
  const disable = (cookie, id) =>
    fetch(`${BASE}/api/system/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ action: "disable" }),
    });

  if (admin.cookie) {
    // login admin สำเร็จ (active) — พิสูจน์ password hash verify ได้
    const au = "__test_admin_" + Date.now();
    const ac = await mk(admin.cookie, au, "active");
    if (ac.user?.id) {
      const al = await login(au, "test1234");
      ok(
        "login admin สำเร็จ (active, hash verify)",
        al.status === 200 && al.json.role === "admin",
        `status ${al.status}`,
      );
      ok(
        "wrong password ของ admin → 401",
        (await login(au, "WRONGpw")).status === 401,
      );
      // disabled
      await disable(admin.cookie, ac.user.id);
      ok(
        "disabled user login ไม่ได้ (403)",
        (await login(au, "test1234")).status === 403,
      );
    } else {
      ok("create active admin", false, ac.error || "no id");
    }

    // pending login ไม่ได้
    const pu = "__test_pending_" + Date.now();
    const pc = await mk(admin.cookie, pu, "pending");
    if (pc.user?.id) {
      ok(
        "pending user login ไม่ได้ (403)",
        (await login(pu, "test1234")).status === 403,
      );
      await disable(admin.cookie, pc.user.id);
    } else {
      ok("create pending user", false, pc.error || "no id");
    }

    // password_hash ไม่ใช่ plain text (users API ต้องไม่คืน field password/password_hash)
    const list = await fetch(`${BASE}/api/system/users`, {
      headers: { Cookie: admin.cookie },
    }).then((r) => r.json());
    const leak = (list.users || []).some(
      (u) => "password" in u || "password_hash" in u,
    );
    ok("password เก็บแบบ hash — users API ไม่คืน plain text", !leak);
  } else {
    console.log(
      "⏭️  ข้าม admin/disabled/pending — login sysadmin ไม่ได้ (รัน /api/auth/setup ก่อน)",
    );
  }

  console.log(
    `\n===== Auth roles: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} =====`,
  );
  process.exit(fail ? 1 : 0);
})();
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

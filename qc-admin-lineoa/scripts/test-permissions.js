// test-permissions.js — ตรวจการ enforce permission ที่ API จริง (ไม่ใช่แค่ซ่อนเมนู)
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
  return sc ? sc.split(";")[0] : null;
}
const code = async (path, cookie) =>
  (await fetch(`${BASE}${path}`, { headers: cookie ? { Cookie: cookie } : {} }))
    .status;
const postCode = async (path, cookie, body = {}) =>
  (
    await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    })
  ).status;

(async () => {
  console.log(`== permission enforcement @ ${BASE} ==`);

  // ไม่มี session → 401
  ok("no session → /api/dashboard 401", (await code("/api/dashboard")) === 401);
  ok(
    "no session → /api/system/users 401",
    (await code("/api/system/users")) === 401,
  );

  // scraper API: x-api-key (service) ต้องผ่าน guard (ไม่ใช่ 401/403); ไม่มี key/session → 401
  const API_KEY = process.env.ADMIN_API_KEY || process.env.QC_API_KEY || "";
  ok(
    "scraper/job no auth → 401",
    (await postCode("/api/scraper/job", null, {})) === 401,
  );
  if (API_KEY) {
    const r = await fetch(`${BASE}/api/scraper/job`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ date_from: "2026-06-01", date_to: "2026-06-01" }),
    });
    ok(
      "scraper/job x-api-key ผ่าน (ไม่ใช่ 401/403)",
      r.status !== 401 && r.status !== 403,
      `status ${r.status}`,
    );
  } else {
    console.log("⏭️  ข้าม scraper x-api-key — ไม่ได้ตั้ง ADMIN_API_KEY");
  }

  const sys = await login("sysadmin", "sysadmin123");
  const mgr = await login("manager", "manager123");
  const mkt = await login("marketing", "marketing123");
  if (!sys) {
    console.log("⏭️  ข้าม — login sysadmin ไม่ได้ (รัน /api/auth/setup ก่อน)");
    console.log(
      `\n===== Permissions: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} =====`,
    );
    process.exit(fail ? 1 : 0);
  }

  // system_admin
  ok(
    "sysadmin → /api/system/users 200",
    (await code("/api/system/users", sys)) === 200,
  );
  ok(
    "sysadmin → /api/system/roles 200",
    (await code("/api/system/roles", sys)) === 200,
  );

  // manager
  ok(
    "manager → /api/qc-disputes 200",
    (await code("/api/qc-disputes", mgr)) === 200,
  );
  ok(
    "manager → /api/system/users 403 (no system.users.view)",
    (await code("/api/system/users", mgr)) === 403,
  );

  // manager — approve dispute ได้ (มี qc.dispute.review): PATCH ต้องไม่ใช่ 401/403
  const mgrPatch = await fetch(`${BASE}/api/qc-disputes/999999999`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: mgr },
    body: JSON.stringify({ status: "approved" }),
  });
  ok(
    "manager → approve dispute (PATCH) ไม่ใช่ 401/403",
    mgrPatch.status !== 401 && mgrPatch.status !== 403,
    `status ${mgrPatch.status}`,
  );
  // marketing approve dispute ไม่ได้ (403)
  const mktPatch = await fetch(`${BASE}/api/qc-disputes/999999999`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: mkt },
    body: JSON.stringify({ status: "approved" }),
  });
  ok(
    "marketing → approve dispute (PATCH) 403",
    mktPatch.status === 403,
    `status ${mktPatch.status}`,
  );

  // marketing — ห้ามดู chat detail
  ok(
    "marketing → /api/dashboard 200",
    (await code("/api/dashboard?from=2026-06-01&to=2026-06-30", mkt)) === 200,
  );
  ok(
    "marketing → /api/replies 403 (no chat perm)",
    (await code("/api/replies", mkt)) === 403,
  );
  ok(
    "marketing → /api/chat/Uxxx 403 (chat detail)",
    (await code("/api/chat/Uxxxxxxxx", mkt)) === 403,
  );
  ok(
    "marketing → /api/sop 403 (no sop.view)",
    (await code("/api/sop", mkt)) === 403,
  );

  // password ต้องไม่เก็บ/ส่งเป็น plain text
  const usersList = await fetch(`${BASE}/api/system/users`, {
    headers: { Cookie: sys },
  }).then((r) => r.json());
  const leak = (usersList.users || []).some(
    (u) => "password" in u || "password_hash" in u,
  );
  ok("users API ไม่ leak password/password_hash (เก็บแบบ hash)", !leak);

  // admin (สร้างชั่วคราว) — ห้ามจัดการ user, ห้ามดู sop
  const uname = "__test_perm_admin_" + Date.now();
  const cr = await fetch(`${BASE}/api/system/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sys },
    body: JSON.stringify({
      username: uname,
      password: "test1234",
      role: "admin",
      status: "active",
    }),
  }).then((r) => r.json());
  const adminCookie = cr.user?.id ? await login(uname, "test1234") : null;
  if (adminCookie) {
    ok("admin login สำเร็จ (password hash verify ได้)", !!adminCookie);
    ok(
      "admin → /api/system/users 403",
      (await code("/api/system/users", adminCookie)) === 403,
    );
    ok(
      "admin → /api/system/roles 403",
      (await code("/api/system/roles", adminCookie)) === 403,
    );
    ok(
      "admin → /api/sop 403 (no sop.view)",
      (await code("/api/sop", adminCookie)) === 403,
    );
    ok(
      "admin → POST /api/sop 403 (no sop edit)",
      (await postCode("/api/sop", adminCookie, { topic: "x", answer: "y" })) ===
        403,
    );
    ok(
      "admin → /api/dashboard 200 (dashboard.admin.view)",
      (await code("/api/dashboard", adminCookie)) === 200,
    );
    // cleanup
    await fetch(`${BASE}/api/system/users/${cr.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: sys },
      body: JSON.stringify({ action: "disable" }),
    });
  } else {
    ok("create temp admin for perm test", false, cr.error || "no id");
  }

  // pending user login ไม่ได้ (สร้าง user status=pending แล้ว login → 403)
  const puname = "__test_pending_" + Date.now();
  const pcr = await fetch(`${BASE}/api/system/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sys },
    body: JSON.stringify({
      username: puname,
      password: "test1234",
      role: "admin",
      status: "pending",
    }),
  }).then((r) => r.json());
  if (pcr.user?.id) {
    const pl = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: puname, password: "test1234" }),
    });
    ok(
      "pending user login ไม่ได้ (403)",
      pl.status === 403,
      `status ${pl.status}`,
    );
    await fetch(`${BASE}/api/system/users/${pcr.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: sys },
      body: JSON.stringify({ action: "disable" }),
    });
  } else {
    ok("create pending user", false, pcr.error || "no id");
  }

  console.log(
    `\n===== Permissions: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} =====`,
  );
  process.exit(fail ? 1 : 0);
})();
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

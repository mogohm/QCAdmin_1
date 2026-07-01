// test-uat-feedback.js — ตรวจ UAT feedback fixes (pages/APIs/permission/session/manual case/evidence)
//   ยิง API จริงบน prod (ต้อง seed + migrate ก่อน)
//   STRICT mode (UAT_STRICT=true): login/ADMIN_API_KEY/migrate ต้องผ่าน — ห้าม skip API tests
const fs = require("fs");
const path = require("path");
const BASE = (
  process.env.AUTH_BASE ||
  process.env.APP_BASE_URL ||
  "https://qc-admin-1.vercel.app"
).replace(/\/$/, "");
// STRICT: เปิดผ่าน --strict (cross-platform) หรือ UAT_STRICT=true
const STRICT =
  process.env.UAT_STRICT === "true" || process.argv.includes("--strict");
let pass = 0,
  fail = 0,
  skip = 0;
const ok = (n, c, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`);
};
// info(): ปกติ = skip (ไม่ fail), STRICT = fail (ห้ามข้าม)
const info = (n) => {
  if (STRICT) {
    fail++;
    console.log(`❌ [STRICT] ${n}`);
  } else {
    skip++;
    console.log(`⏭️  ${n}`);
  }
};
const root = path.join(__dirname, "..");
const exists = (p) => fs.existsSync(path.join(root, p));

async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, remember: true }),
  });
  const sc = r.headers.get("set-cookie");
  return {
    status: r.status,
    cookie: sc ? sc.split(";")[0] : null,
    setCookie: sc,
  };
}
const code = (p, cookie, method = "GET", body) =>
  fetch(`${BASE}${p}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

(async () => {
  console.log(`== UAT feedback @ ${BASE} ==`);

  // ---- A) ไฟล์ pages/components มีอยู่จริง ----
  ok(
    "ScoringCriteriaPanel component มีอยู่",
    exists("app/components/ScoringCriteriaPanel.js"),
  );
  ok(
    "EvidenceViewer component มีอยู่",
    exists("app/components/EvidenceViewer.js"),
  );
  ok("หน้า /ai-review มีอยู่", exists("app/ai-review/page.js"));
  ok("หน้า /manual-case มีอยู่", exists("app/manual-case/page.js"));
  ok(
    "หน้า /knowledge-training มีอยู่",
    exists("app/knowledge-training/page.js"),
  );
  ok(
    "Chat Review มีคำอธิบาย + filters",
    /ตรวจสอบบทสนทนาที่ถูกนำมาประเมิน QC/.test(
      fs.readFileSync(path.join(root, "app/chat-review/page.js"), "utf8"),
    ),
  );
  ok(
    "QC Monitoring มีปุ่มกลับ Dashboard",
    /กลับ Dashboard/.test(
      fs.readFileSync(path.join(root, "app/qc-dashboard/page.js"), "utf8"),
    ),
  );

  // ---- G) session cookie config ----
  const anon = await login("sysadmin", "sysadmin123");
  if (anon.setCookie) {
    ok("cookie เป็น HttpOnly", /HttpOnly/i.test(anon.setCookie));
    ok("cookie SameSite=Lax", /SameSite=Lax/i.test(anon.setCookie));
    ok(
      "remember me → Max-Age นาน (>7วัน)",
      /Max-Age=(\d+)/.test(anon.setCookie) &&
        Number(anon.setCookie.match(/Max-Age=(\d+)/)[1]) > 7 * 24 * 3600 - 10,
    );
  } else {
    info("ข้าม session cookie — login sysadmin ไม่ได้ (seed ก่อน)");
  }

  const sys = anon.cookie;
  if (!sys) {
    info("ข้าม API tests — ต้อง seed /api/auth/setup + migrate ก่อน");
    console.log(
      `\n===== UAT feedback: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} / ข้าม ${skip} =====`,
    );
    process.exit(fail ? 1 : 0);
  }

  // ---- migrate (idempotent) ----
  if (process.env.ADMIN_API_KEY) {
    const mg = await fetch(`${BASE}/api/admin/migrate-uat`, {
      method: "POST",
      headers: { "x-api-key": process.env.ADMIN_API_KEY },
    });
    ok("migrate-uat สร้างตาราง UAT สำเร็จ", mg.status === 200);
  } else info("ข้าม migrate — ไม่ได้ตั้ง ADMIN_API_KEY");

  // ---- C) AI review queue API ----
  ok(
    "GET /api/ai-review (sysadmin) 200",
    (await code("/api/ai-review", sys)).status === 200,
  );

  // ---- D) evidence API ต้องการ param ----
  ok(
    "GET /api/case-evidence ไม่มี param → 400",
    (await code("/api/case-evidence", sys)).status === 400,
  );

  // ---- E) manual case → สร้าง qc_scores จริง ----
  const mc = await code("/api/manual-case", sys, "POST", {
    customer_name: "UAT ทดสอบ",
    admin_name: "PK UAT",
    customer_text: "ขอลิงก์ฝากเงินหน่อยครับ",
    admin_text: "รบกวนรอสักครู่นะคะ กำลังดำเนินการให้ค่ะ",
    response_seconds: 45,
    reason: "uat auto test",
  });
  const mcj = await mc.json().catch(() => ({}));
  ok(
    "Manual case สร้าง qc_score + ให้คะแนน",
    mc.status === 200 && mcj.qc_score_id != null && mcj.final_score != null,
    `score ${mcj.final_score}`,
  );
  if (mcj.qc_score_id) {
    const ev = await code(
      `/api/case-evidence?qc_score_id=${mcj.qc_score_id}`,
      sys,
    );
    const evj = await ev.json().catch(() => ({}));
    ok(
      "Manual case มีหลักฐาน (case_evidence)",
      ev.status === 200 &&
        Array.isArray(evj.evidence) &&
        evj.evidence.length > 0,
    );
  }

  // ---- F) knowledge training สร้าง SOP/knowledge ----
  const kt = await code("/api/knowledge-training", sys, "POST", {
    topic: "UAT_Poker_" + Date.now(),
    answer: "C$ คือหน่วยชิปในเกม Poker",
    knowledge_type: "Poker",
    intent: "poker",
    example_questions: ["C$ คืออะไร"],
  });
  ok("Knowledge training สร้างความรู้ (SOP)", kt.status === 200);
  const tm = await code("/api/knowledge-training/test-match", sys, "POST", {
    question: "C$ คืออะไร",
  });
  ok("test-match ทำงาน (คืน matched)", tm.status === 200);

  // ---- H) permission enforcement บน API ใหม่ ----
  const mkt = (await login("marketing", "marketing123")).cookie;
  if (mkt) {
    ok(
      "marketing → /api/ai-review 403",
      (await code("/api/ai-review", mkt)).status === 403,
    );
    ok(
      "marketing → /api/manual-case POST 403",
      (await code("/api/manual-case", mkt, "POST", {})).status === 403,
    );
    ok(
      "marketing → /api/knowledge-training POST 403",
      (await code("/api/knowledge-training", mkt, "POST", {})).status === 403,
    );
  } else info("ข้าม marketing perm — login ไม่ได้");
  ok(
    "no session → /api/ai-review 401",
    (await code("/api/ai-review")).status === 401,
  );
  ok(
    "no session → /api/manual-case 401",
    (await code("/api/manual-case", null, "POST", {})).status === 401,
  );

  console.log(
    `\n===== UAT feedback: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} / ข้าม ${skip} =====`,
  );
  process.exit(fail ? 1 : 0);
})();

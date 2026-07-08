// ============================================================
// qa-role-smoke.js — smoke ทุก role จริงบน production (manager/leader/admin/marketing)
//   ต่อ role: login ผ่านหน้า UI จริง → ตรวจเมนูที่เห็น → เปิดทุกหน้าที่ได้รับสิทธิ์ →
//   ทำ 1 action ที่ได้รับอนุญาต → ลอง 1 อย่างที่ต้องห้าม (ต้อง 403/redirect)
//   สร้าง user ทดสอบชั่วคราวด้วย x-api-key แล้วปิดทิ้งตอนจบ
//   ใช้: node scripts/qa-role-smoke.js
// ============================================================
require("dotenv").config();
const { chromium } = require("playwright");

const BASE = (process.env.QC_API_URL || "https://qc-admin-1.vercel.app").replace(/\/$/, "");
const KEY = process.env.QC_API_KEY || process.env.ADMIN_API_KEY || "";
const TS = Date.now();

let pass = 0, fail = 0;
const rec = (id, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${id}${detail ? " — " + detail : ""}`);
};
const RAW_ERR = /invalid input syntax|syntax error at|\[object Object\]|Application error/i;

const keyApi = (p, opts = {}) =>
  fetch(BASE + p, { ...opts, headers: { "Content-Type": "application/json", "x-api-key": KEY, ...(opts.headers || {}) } }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));

// นิยามต่อ role: หน้า ROLE_HOME, เมนูที่ต้องเห็น/ต้องไม่เห็น, หน้าที่เปิดได้, forbidden API
const ROLES = {
  manager: {
    home: "/",
    menuHas: ["/qc-dashboard", "/chat-review", "/scraper"],
    menuNot: ["/system/users", "/system/roles"],
    pages: ["/", "/qc-dashboard", "/chat-review", "/ai-review", "/disputes", "/sop", "/admin-performance", "/leaderboard", "/manager-dashboard", "/marketing-dashboard", "/scraper"],
    forbiddenApi: { method: "POST", path: "/api/system/users", body: { username: "x", password: "x", role: "admin" } },
  },
  leader: {
    home: "/admin-performance",
    menuHas: ["/qc-dashboard", "/chat-review"],
    menuNot: ["/system/users", "/scraper"],
    pages: ["/admin-performance", "/qc-dashboard", "/chat-review", "/ai-review", "/disputes", "/leaderboard", "/manager-dashboard"],
    forbiddenApi: { method: "POST", path: "/api/sop", body: { topic: "x", answer: "x" } }, // ไม่มี sop.create
  },
  admin: {
    home: "/admin-dashboard",
    menuHas: ["/admin-dashboard", "/chat-review"],
    menuNot: ["/system/users", "/qc-dashboard", "/scraper"],
    pages: ["/admin-dashboard", "/chat-review", "/disputes"],
    forbiddenApi: { method: "GET", path: "/api/system/users" }, // ไม่มี system.users.view
  },
  marketing: {
    home: "/marketing-dashboard",
    menuHas: ["/marketing-dashboard", "/commission"],
    menuNot: ["/system/users", "/qc-dashboard", "/sop"],
    pages: ["/marketing-dashboard", "/commission"],
    forbiddenApi: { method: "POST", path: "/api/sop", body: { topic: "x", answer: "x" } },
  },
};

(async () => {
  if (!KEY) { console.error("ไม่มี QC_API_KEY"); process.exit(2); }
  console.log(`== role smoke @ ${BASE} ==`);
  const browser = await chromium.launch({ headless: true });
  const cleanupUsers = [];
  const cleanupSop = [];
  let disposableQc = null; // สำหรับ action ของ admin/leader (dispute)

  // เตรียมเคสทดสอบสำหรับ action (สร้างด้วย superuser key)
  {
    const mc = await keyApi("/api/manual-case", { method: "POST", body: JSON.stringify({ line_user_id: `manual_qa_role_${TS}`, customer_name: "QA_ROLE_ลูกค้า", admin_name: "PK - QA Bot", customer_text: `xyzzy role smoke ${TS}`, admin_text: "รับทราบครับ (QA role)" }) });
    disposableQc = mc.j?.qc_score_id || mc.j?.qc?.id || null;
    const sop = await keyApi("/api/sop", { method: "POST", body: JSON.stringify({ topic: `QA_ROLE_SOP_${TS}`, question: "q", answer: "a", intent: "deposit" }) });
    if (sop.j?.sop?.id) cleanupSop.push(sop.j.sop.id);
    console.log(`(setup: qc=${disposableQc ? "ok" : "none"} sop=${cleanupSop[0] || "none"})`);
  }

  for (const [role, cfg] of Object.entries(ROLES)) {
    console.log(`\n===== ROLE: ${role} =====`);
    const uname = `qa_${role}_${TS}`;
    const pw = `Qa!${TS}${role}`;
    const c = await keyApi("/api/system/users", { method: "POST", body: JSON.stringify({ username: uname, password: pw, role, display_name: `QA ${role} (ลบได้)` }) });
    const uid = c.j?.user?.id ?? c.j?.id;
    rec(`${role}: สร้าง user ทดสอบ`, c.status < 300 && !!uid);
    if (uid) cleanupUsers.push(uid);

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const uiFetch = async (path, opts = {}) => {
      for (let i = 0; i < 3; i++) {
        try {
          return await page.evaluate(async ({ path, opts }) => {
            const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
            let j = null; try { j = await r.json(); } catch {}
            return { status: r.status, j };
          }, { path, opts });
        } catch { await page.waitForTimeout(600); }
      }
      return { status: 0, j: null };
    };

    // 1) login ผ่านหน้า UI
    try {
      await page.goto(BASE + "/login", { waitUntil: "networkidle" });
      await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(uname);
      await page.locator('input[type="password"]').first().fill(pw);
      await page.locator('input[type="password"]').first().press("Enter");
      await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 25000 });
      const landed = new URL(page.url()).pathname;
      rec(`${role}: login UI → home`, true, `landed=${landed}`);
    } catch (e) {
      rec(`${role}: login UI → home`, false, e.message.slice(0, 80));
      await ctx.close();
      continue;
    }

    // 2) เมนูที่เห็น (sidebar) ต้องตรงสิทธิ์
    await page.goto(BASE + cfg.home, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(600);
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href"))).catch(() => []);
    const hasAll = cfg.menuHas.every((h) => hrefs.includes(h));
    const notAny = cfg.menuNot.every((h) => !hrefs.includes(h));
    rec(`${role}: เมนูที่ควรเห็นครบ`, hasAll, cfg.menuHas.filter((h) => !hrefs.includes(h)).join(","));
    rec(`${role}: เมนูต้องห้ามไม่โผล่`, notAny, cfg.menuNot.filter((h) => hrefs.includes(h)).join(","));

    // 3) เปิดทุกหน้าที่ได้รับสิทธิ์
    let pagesOk = 0;
    for (const p of cfg.pages) {
      await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(300);
      const url = page.url();
      const body = await page.evaluate(() => document.body?.innerText?.slice(0, 4000) || "").catch(() => "");
      const ok = !url.includes("/forbidden") && !url.includes("/login") && !RAW_ERR.test(body);
      if (ok) pagesOk++;
      else rec(`${role}: page ${p}`, false, url.replace(BASE, ""));
    }
    rec(`${role}: เปิดหน้าที่ได้รับสิทธิ์ ${pagesOk}/${cfg.pages.length}`, pagesOk === cfg.pages.length);

    // 4) หนึ่ง action ที่ได้รับอนุญาต (ของจริง)
    if (role === "manager" && cleanupSop[0]) {
      const r = await uiFetch(`/api/sop/${cleanupSop[0]}`, { method: "PATCH", body: JSON.stringify({ answer: "แก้โดย manager (QA)" }) });
      rec("manager: action sop.update (PATCH SOP)", r.status === 200, `status=${r.status}`);
    } else if (role === "leader" && disposableQc) {
      const dc = await uiFetch("/api/qc-disputes", { method: "POST", body: JSON.stringify({ qc_score_id: disposableQc, reason: "QA role smoke" }) });
      const did = dc.j?.dispute?.id;
      const ap = did ? await uiFetch(`/api/qc-disputes/${did}`, { method: "PATCH", body: JSON.stringify({ status: "approved", new_score: 85 }) }) : { status: 0 };
      rec("leader: action qc.dispute.review (approve)", ap.status === 200 && ap.j?.updated_score === 85, `status=${ap.status}`);
    } else if (role === "admin" && disposableQc) {
      // admin มี qc.dispute.create — สร้าง dispute (อาจ 409 ถ้ามี pending อยู่ = สิทธิ์ผ่านเช่นกัน)
      const dc = await uiFetch("/api/qc-disputes", { method: "POST", body: JSON.stringify({ qc_score_id: disposableQc, reason: "QA admin role" }) });
      rec("admin: action qc.dispute.create", dc.status === 200 || dc.status === 409, `status=${dc.status}`);
    } else if (role === "marketing") {
      const r = await uiFetch("/api/dashboard?from=2026-07-01&to=2026-07-07");
      rec("marketing: action ดูข้อมูล dashboard (read)", r.status === 200, `status=${r.status}`);
    }

    // 5) forbidden: direct URL + API → ต้องโดนปฏิเสธ
    await page.goto(BASE + "/system/users", { waitUntil: "networkidle", timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(400);
    const fUrl = page.url();
    const fBody = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) || "").catch(() => "");
    const pageBlocked = fUrl.includes("/forbidden") || fUrl.includes("/login") || /ไม่มีสิทธิ์|forbidden|403/i.test(fBody);
    rec(`${role}: หน้า /system/users ถูกปฏิเสธ`, pageBlocked, fUrl.replace(BASE, ""));
    const fa = cfg.forbiddenApi;
    const fr = await uiFetch(fa.path, { method: fa.method, ...(fa.body ? { body: JSON.stringify(fa.body) } : {}) });
    rec(`${role}: forbidden API ${fa.method} ${fa.path} → 403`, fr.status === 403 || fr.status === 401, `status=${fr.status}`);

    await ctx.close();
  }

  // cleanup
  console.log("\n== cleanup ==");
  for (const sid of cleanupSop) await keyApi(`/api/sop/${sid}?hard=true`, { method: "DELETE" });
  await keyApi("/api/admin/cleanup-customer", { method: "POST", body: JSON.stringify({ line_user_id: `manual_qa_role_${TS}` }) });
  for (const uid of cleanupUsers) await keyApi(`/api/system/users/${uid}`, { method: "PATCH", body: JSON.stringify({ action: "disable" }) });
  console.log(`  users disabled=${cleanupUsers.length} sop deleted=${cleanupSop.length}`);

  await browser.close();
  console.log(`\n===== สรุป: PASS ${pass} / FAIL ${fail} =====`);
  process.exit(fail === 0 ? 0 : 1);
})();

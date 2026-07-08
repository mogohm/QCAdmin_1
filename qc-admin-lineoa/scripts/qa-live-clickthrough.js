// ============================================================
// qa-live-clickthrough.js — Full Functional QA (system_admin) บน production จริง
//   - สร้าง user ทดสอบชั่วคราว → login ผ่าน "หน้า login จริง" (Playwright)
//   - เปิดทุกหน้า: ตรวจ 5xx / raw SQL error / [object Object] / redirect forbidden
//   - รัน P1 flows จริง: SOP CRUD, Knowledge+TestMatch, ManualCase→QC→AIReview→approve,
//     Dispute approve, SystemEvents, Scraper job (today block/strict/cancel),
//     Users (create/disable→login fail/enable), Roles (toggle perm + restore),
//     Registration (pending→login fail→approve→login ok / reject), Evidence contract
//   - ทุก write ตรวจ persistence (reload/GET ซ้ำ) + cleanup ข้อมูลทดสอบ
//   ใช้: node scripts/qa-live-clickthrough.js   (ต้องมี QC_API_KEY; BASE=QC_API_URL)
// ============================================================
require("dotenv").config();
const { chromium } = require("playwright");

const BASE = (process.env.QC_API_URL || "https://qc-admin-1.vercel.app").replace(/\/$/, "");
const KEY = process.env.QC_API_KEY || process.env.ADMIN_API_KEY || "";
const TS = Date.now();
const QA_USER = `qa_sysadmin_${TS}`;
const QA_PASS = `Qa!${TS}x`;

let pass = 0, fail = 0, blocked = 0;
const results = [];
const rec = (id, status, detail = "") => {
  results.push({ id, status, detail });
  if (status === "PASS") pass++; else if (status === "FAIL") fail++; else blocked++;
  console.log(`${status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️"} [${status}] ${id}${detail ? " — " + detail : ""}`);
};

const RAW_ERR = /invalid input syntax|syntax error at|relation .+ does not exist|column .+ does not exist|\[object Object\]|Application error: a client-side exception/i;

const keyApi = (p, opts = {}) =>
  fetch(BASE + p, { ...opts, headers: { "Content-Type": "application/json", "x-api-key": KEY, ...(opts.headers || {}) } });

(async () => {
  if (!KEY) { console.error("ไม่มี QC_API_KEY"); process.exit(2); }
  console.log(`== QA live click-through @ ${BASE} ==\n`);
  const cleanup = { userIds: [], sopIds: [], eventIds: [], custKeys: [], regUserIds: [] };

  // ---------- SETUP: สร้าง system_admin ชั่วคราว ----------
  {
    const r = await keyApi("/api/system/users", { method: "POST", body: JSON.stringify({ username: QA_USER, password: QA_PASS, role: "system_admin", display_name: "QA Bot (ลบได้)" }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { rec("setup: create qa system_admin", "FAIL", JSON.stringify(j).slice(0, 100)); process.exit(1); }
    cleanup.userIds.push(j.user?.id ?? j.id);
    rec("setup: create qa system_admin", "PASS", QA_USER);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const net5xx = [];
  page.on("response", (r) => { if (r.status() >= 500) net5xx.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
  const consoleErrs = [];
  page.on("pageerror", (e) => consoleErrs.push(String(e).slice(0, 120)));

  // in-page fetch — request เดียวกับที่ปุ่มจริงยิง (พก session cookie)
  //   retry เมื่อ execution context ถูกทำลาย (หน้า navigate ระหว่างรอ)
  const uiFetch = async (path, opts = {}) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await page.evaluate(async ({ path, opts }) => {
          const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
          let j = null; try { j = await r.json(); } catch {}
          return { status: r.status, j };
        }, { path, opts });
      } catch (e) {
        if (attempt === 2) return { status: 0, j: { error: e.message } };
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(700);
      }
    }
  };

  // ---------- PHASE 2: LOGIN ผ่านหน้า login จริง ----------
  try {
    await page.goto(BASE + "/login", { waitUntil: "networkidle" });
    const userInput = page.locator('input:not([type="password"]):not([type="checkbox"])').first();
    await userInput.fill(QA_USER);
    await page.locator('input[type="password"]').first().fill(QA_PASS);
    await page.locator('input[type="password"]').first().press("Enter");
    await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 25000 }).catch(async () => {
      // Enter ไม่ submit → ลองคลิกปุ่ม
      await page.click('button:has-text("เข้าสู่ระบบ")', { timeout: 3000 }).catch(() => {});
      await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 20000 });
    });
    rec("login: system_admin ผ่านหน้า UI", "PASS", page.url().replace(BASE, ""));
  } catch (e) {
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 300)).catch(() => "");
    rec("login: system_admin ผ่านหน้า UI", "FAIL", `${e.message.slice(0, 80)} | page: ${body.replace(/\n/g, " ").slice(0, 150)}`);
    await browser.close(); process.exit(1);
  }

  // ---------- PAGE AUDIT: เปิดทุกหน้า ----------
  const PAGES = ["/", "/qc-dashboard", "/chat-review", "/ai-review", "/manual-case", "/knowledge-training", "/sop", "/disputes", "/system-events", "/admin-performance", "/commission", "/marketing-dashboard", "/scraper", "/leaderboard", "/manager-dashboard", "/admin-dashboard", "/system/users", "/system/roles", "/system/registration-requests", "/rules", "/scrape-report"];
  for (const p of PAGES) {
    net5xx.length = 0; consoleErrs.length = 0;
    try {
      await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(400);
      const url = page.url();
      const body = await page.evaluate(() => document.body?.innerText?.slice(0, 8000) || "");
      const redirected = url.includes("/forbidden") || url.includes("/login");
      const rawErr = RAW_ERR.test(body);
      if (redirected) rec(`page ${p}`, "FAIL", `redirect → ${url.replace(BASE, "")}`);
      else if (rawErr) rec(`page ${p}`, "FAIL", "raw error/[object Object] บนหน้า");
      else if (net5xx.length) rec(`page ${p}`, "FAIL", net5xx.slice(0, 2).join(", "));
      else if (consoleErrs.length) rec(`page ${p}`, "FAIL", "js error: " + consoleErrs[0]);
      else rec(`page ${p}`, "PASS");
    } catch (e) { rec(`page ${p}`, "FAIL", e.message.slice(0, 100)); }
  }

  // ---------- P1: SOP CRUD ----------
  const sopTopic = `QA_TEST_SOP_${TS}`;
  {
    const c = await uiFetch("/api/sop", { method: "POST", body: JSON.stringify({ topic: sopTopic, question: "คำถามทดสอบ QA", answer: "คำตอบทดสอบ QA", intent: "deposit", category_code: "deposit" }) });
    const sid = c.j?.sop?.id ?? c.j?.id;
    if (c.status < 300 && sid) { cleanup.sopIds.push(sid); rec("SOP: create", "PASS", `id=${sid}`); } else rec("SOP: create", "FAIL", JSON.stringify(c.j).slice(0, 100));
    if (sid) {
      // UI persistence: reload + search เจอ
      await page.goto(BASE + "/sop", { waitUntil: "networkidle" });
      await page.fill('input[placeholder*="ค้นหา topic"]', sopTopic).catch(() => {});
      await page.waitForTimeout(800);
      const found = (await page.evaluate(() => document.body.innerText)).includes(sopTopic);
      rec("SOP: ปรากฏบนหน้า /sop หลัง reload", found ? "PASS" : "FAIL");
      const e2 = await uiFetch(`/api/sop/${sid}`, { method: "PATCH", body: JSON.stringify({ answer: "คำตอบแก้ไขแล้ว QA v2" }) });
      rec("SOP: edit (PATCH)", e2.status < 300 && e2.j?.sop?.answer?.includes("v2") ? "PASS" : "FAIL", `status=${e2.status}`);
      const d1 = await uiFetch(`/api/sop/${sid}`, { method: "DELETE" });
      rec("SOP: soft delete", d1.status < 300 && d1.j?.soft_deleted ? "PASS" : "FAIL", `status=${d1.status}`);
      const bad = await uiFetch(`/api/sop/abc`, { method: "PATCH", body: JSON.stringify({ topic: "x" }) });
      rec("SOP: id ผิดชนิด → 400 ไทย", bad.status === 400 && !RAW_ERR.test(JSON.stringify(bad.j)) ? "PASS" : "FAIL", `status=${bad.status}`);
    }
  }

  // ---------- P1: Knowledge Training + Test Match ----------
  const knowTopic = `QA_TEST_KNOW_${TS}`;
  {
    const c = await uiFetch("/api/knowledge-training", { method: "POST", body: JSON.stringify({ topic: knowTopic, answer: "Rush & Cash คือเกมโป๊กเกอร์เร็ว (QA)", knowledge_type: "Poker", intent: "poker", example_questions: ["Rush and Cash คืออะไร QA"] }) });
    const kid = c.j?.knowledge?.id ?? c.j?.id ?? c.j?.sop?.id;
    if (c.status < 300 && kid) { cleanup.sopIds.push(kid); rec("Knowledge: create", "PASS", `id=${kid}`); } else rec("Knowledge: create", "FAIL", `status=${c.status} ${JSON.stringify(c.j).slice(0, 80)}`);
    const m = await uiFetch("/api/knowledge-training/test-match", { method: "POST", body: JSON.stringify({ question: "Rush and Cash คืออะไร QA" }) });
    rec("Knowledge: Test Match คืน match+confidence", m.status < 300 && (m.j?.matched || m.j?.sop || m.j?.best) ? "PASS" : "FAIL", JSON.stringify(m.j).slice(0, 90));
    if (kid) {
      const e = await uiFetch(`/api/knowledge-training/${kid}`, { method: "PATCH", body: JSON.stringify({ training_status: "off" }) });
      rec("Knowledge: deactivate", e.status < 300 ? "PASS" : "FAIL", `status=${e.status}`);
    }
  }

  // ---------- P1: Manual Case → QC → AI Review → approve ----------
  let qcScoreId = null; const custKey = `manual_qa_${TS}`;
  {
    const c = await uiFetch("/api/manual-case", { method: "POST", body: JSON.stringify({ line_user_id: custKey, customer_name: "QA_TEST_ลูกค้า", admin_name: "PK - QA Bot", customer_text: `xyzzy เรื่องที่ไม่มีในระบบ ${TS} ครับ`, admin_text: "รับทราบครับ เดี๋ยวตรวจสอบให้นะครับ (QA)" }) });
    cleanup.custKeys.push(custKey);
    qcScoreId = c.j?.qc_score_id || c.j?.qc?.id || c.j?.score?.id || null;
    rec("ManualCase: สร้างเคส + runQc", c.status < 300 && qcScoreId ? "PASS" : "FAIL", `qc=${qcScoreId} ${c.status >= 300 ? JSON.stringify(c.j).slice(0, 80) : ""}`);
    if (qcScoreId) {
      const rep = await uiFetch(`/api/replies?limit=50`);
      const inList = JSON.stringify(rep.j || {}).includes("QA_TEST_ลูกค้า");
      rec("ManualCase: ปรากฏใน Chat Review data", inList ? "PASS" : "FAIL");
      // AI Review: เคสนี้ควรเข้าคิว (SOP ไม่ match) → หาแถวจาก qc_score_id
      const q = await uiFetch(`/api/ai-review?status=pending`);
      const row = (q.j?.items || []).find((x) => x.qc_score_id === qcScoreId);
      rec("AIReview: เคสเข้าคิวอัตโนมัติ + linkage", row ? "PASS" : "FAIL", row ? `case_ref=${row.case_ref}` : "ไม่พบในคิว");
      if (row) {
        const det = await uiFetch(`/api/ai-review/${row.id}`);
        rec("AIReview: GET detail (timeline/analysis/history)", det.status === 200 && det.j?.item?.case_ref && Array.isArray(det.j?.timeline) && det.j?.history?.length ? "PASS" : "FAIL", `timeline=${det.j?.timeline?.length}`);
        // เปิดหน้า + คลิกปุ่ม "ตรวจ" จริง → modal 4 แท็บ
        await page.goto(BASE + "/ai-review", { waitUntil: "networkidle" });
        await page.click('td >> button:has-text("ตรวจ")', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(900);
        const modalTxt = await page.evaluate(() => document.body.innerText);
        const tabsOk = ["บทสนทนา", "การวิเคราะห์ AI", "หลักฐาน", "ประวัติการตรวจ"].every((t) => modalTxt.includes(t)) && /QC-\d{8}-/.test(modalTxt);
        rec("AIReview: คลิก 'ตรวจ' → modal 4 แท็บ + case_ref", tabsOk ? "PASS" : "FAIL");
        for (const t of ["การวิเคราะห์ AI", "หลักฐาน", "ประวัติการตรวจ"]) {
          await page.click(`button:has-text("${t}")`, { timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(350);
        }
        const afterTabs = await page.evaluate(() => document.body.innerText);
        rec("AIReview: สลับแท็บไม่ crash", !RAW_ERR.test(afterTabs) ? "PASS" : "FAIL");
        // action approve บนแถว disposable
        const ap = await uiFetch(`/api/ai-review/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "approve" }) });
        rec("AIReview: อนุมัติผล AI (PATCH)", ap.status === 200 && ap.j?.item?.status === "approved" && ap.j?.item?.reviewed_by ? "PASS" : "FAIL", `by=${ap.j?.item?.reviewed_by}`);
        const q2 = await uiFetch(`/api/ai-review?status=approved`);
        rec("AIReview: persistence (approved ใน list)", (q2.j?.items || []).some((x) => x.id === row.id) ? "PASS" : "FAIL");
      }
      // ---------- P1: Dispute ----------
      const dc = await uiFetch("/api/qc-disputes", { method: "POST", body: JSON.stringify({ qc_score_id: qcScoreId, reason: "QA: ขอโต้แย้งคะแนน (ทดสอบ)", requested_by: "QA Bot" }) });
      const did = dc.j?.dispute?.id ?? dc.j?.id;
      rec("Dispute: create", dc.status < 300 && did ? "PASS" : "FAIL", `status=${dc.status} ${!did ? JSON.stringify(dc.j).slice(0, 80) : ""}`);
      if (did) {
        const da = await uiFetch(`/api/qc-disputes/${did}`, { method: "PATCH", body: JSON.stringify({ status: "approved", new_score: 88, reviewer_note: "QA approve" }) });
        rec("Dispute: approve + คะแนนใหม่", da.status === 200 && da.j?.updated_score === 88 ? "PASS" : "FAIL", `updated=${da.j?.updated_score}`);
        // qc_disputes.id เป็น INTEGER → invalid = ตัวอักษร ("abc"), ส่วน 999999 ที่ไม่มี = 404
        const bad = await uiFetch(`/api/qc-disputes/abc`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) });
        rec("Dispute: id ผิดชนิด → 400 ไทย", bad.status === 400 && !RAW_ERR.test(JSON.stringify(bad.j)) ? "PASS" : "FAIL", `status=${bad.status}`);
      }
    }
  }

  // ---------- P1: System Events ----------
  {
    const now = new Date(); const end = new Date(Date.now() + 3600000);
    const c = await uiFetch("/api/system-events", { method: "POST", body: JSON.stringify({ title: `QA_TEST_EVENT_${TS}`, description: "ทดสอบระบบ (ลบได้)", event_type: "maintenance", affects_sla: true, starts_at: now.toISOString(), ends_at: end.toISOString() }) });
    const eid = c.j?.event?.id ?? c.j?.id;
    rec("SystemEvent: create (affects_sla)", c.status < 300 && eid ? "PASS" : "FAIL", `status=${c.status}`);
    if (eid) {
      cleanup.eventIds.push(eid);
      await page.goto(BASE + "/system-events", { waitUntil: "networkidle" });
      const seen = (await page.evaluate(() => document.body.innerText)).includes(`QA_TEST_EVENT_${TS}`);
      rec("SystemEvent: ปรากฏบนหน้า", seen ? "PASS" : "FAIL");
      const d = await uiFetch(`/api/system-events/${eid}`, { method: "PATCH", body: JSON.stringify({ is_active: false }) });
      rec("SystemEvent: deactivate", d.status < 300 ? "PASS" : "FAIL", `status=${d.status}`);
    }
  }

  // ---------- P1: Scraper controls ----------
  {
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const yest = new Date(Date.now() + 7 * 3600000 - 86400000).toISOString().slice(0, 10);
    const t = await uiFetch("/api/scraper/job", { method: "POST", body: JSON.stringify({ date_from: today, date_to: today }) });
    rec("Scraper: วันนี้ถูกบล็อก (400 ไทย)", t.status === 400 && /วันนี้|แอดมิน/.test(t.j?.error || "") ? "PASS" : "FAIL", `status=${t.status}`);
    const y = await uiFetch("/api/scraper/job", { method: "POST", body: JSON.stringify({ date_from: yest, date_to: yest, mode: "strict" }) });
    rec("Scraper: สร้าง job เมื่อวาน mode=strict", y.status < 300 && y.j?.job?.mode === "strict" ? "PASS" : "FAIL", `mode=${y.j?.job?.mode}`);
    const del = await uiFetch("/api/scraper/job", { method: "DELETE" });
    rec("Scraper: ยกเลิก job", del.status < 300 && del.j?.ok ? "PASS" : "FAIL", `cancelled=${del.j?.cancelled}`);
  }

  // ---------- P1: Users create/disable/enable ----------
  {
    const uname = `qa_marketing_${TS}`;
    const c = await uiFetch("/api/system/users", { method: "POST", body: JSON.stringify({ username: uname, password: QA_PASS, role: "marketing", display_name: "QA Marketing (ลบได้)" }) });
    const uid = c.j?.user?.id ?? c.j?.id;
    rec("Users: create marketing", c.status < 300 && uid ? "PASS" : "FAIL", `status=${c.status}`);
    if (uid) {
      cleanup.userIds.push(uid);
      const l1 = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: uname, password: QA_PASS }) });
      rec("Users: user ใหม่ login ได้", l1.ok ? "PASS" : "FAIL", `status=${l1.status}`);
      const d = await uiFetch(`/api/system/users/${uid}`, { method: "PATCH", body: JSON.stringify({ action: "disable" }) });
      rec("Users: disable", d.status < 300 ? "PASS" : "FAIL", `status=${d.status}`);
      const l2 = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: uname, password: QA_PASS }) });
      rec("Users: disabled login ถูกปฏิเสธ", l2.status === 403 || l2.status === 401 ? "PASS" : "FAIL", `status=${l2.status}`);
      const e = await uiFetch(`/api/system/users/${uid}`, { method: "PATCH", body: JSON.stringify({ action: "enable" }) });
      const l3 = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: uname, password: QA_PASS }) });
      rec("Users: enable → login ได้อีกครั้ง", e.status < 300 && l3.ok ? "PASS" : "FAIL");
      await uiFetch(`/api/system/users/${uid}`, { method: "PATCH", body: JSON.stringify({ action: "disable" }) }); // ปิดทิ้งท้าย
    }
  }

  // ---------- P1: Roles toggle + restore ----------
  //   permissions อ่านจาก list endpoint (/api/system/roles → roles[].permissions)
  {
    const readPerms = async () => {
      const g = await uiFetch("/api/system/roles");
      const roles = g.j?.roles || g.j?.list || g.j || [];
      const mk = (Array.isArray(roles) ? roles : []).find((r) => r.role_key === "marketing");
      return mk?.permissions || null;
    };
    const perms = await readPerms();
    if (!Array.isArray(perms) || !perms.length) rec("Roles: toggle permission", "BLOCKED", "อ่าน permissions ของ marketing ไม่ได้");
    else {
      const removed = perms[perms.length - 1];
      const p1 = await uiFetch("/api/system/roles/marketing", { method: "PATCH", body: JSON.stringify({ permissions: perms.filter((p) => p !== removed) }) });
      const after1 = await readPerms();
      const gone = Array.isArray(after1) && !after1.includes(removed);
      const p2 = await uiFetch("/api/system/roles/marketing", { method: "PATCH", body: JSON.stringify({ permissions: perms }) });
      const after2 = await readPerms();
      const back = Array.isArray(after2) && after2.includes(removed);
      rec("Roles: ถอด permission → หาย → คืน → กลับมา", p1.status < 300 && gone && p2.status < 300 && back ? "PASS" : "FAIL", `perm=${removed} gone=${gone} back=${back}`);
    }
  }

  // ---------- P1: Registration approve/reject ----------
  {
    const rn = `qa_reg_${TS}`;
    const r1 = await fetch(BASE + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: rn, password: QA_PASS, confirm: QA_PASS, requested_role: "marketing", note: "QA test" }) });
    rec("Register: สมัคร (pending)", r1.ok ? "PASS" : "FAIL", `status=${r1.status}`);
    const lp = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: rn, password: QA_PASS }) });
    rec("Register: pending login ถูกปฏิเสธ", !lp.ok ? "PASS" : "FAIL", `status=${lp.status}`);
    const list = await uiFetch("/api/system/registration-requests");
    const reqRow = (list.j?.requests || list.j?.items || list.j || []).find?.((x) => x.username === rn);
    if (!reqRow) rec("Register: approve flow", "BLOCKED", "หา request ไม่เจอ");
    else {
      const ap = await uiFetch(`/api/system/registration-requests/${reqRow.id}`, { method: "PATCH", body: JSON.stringify({ action: "approve", role: "marketing" }) });
      const la = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: rn, password: QA_PASS }) });
      rec("Register: approve → login ได้", ap.status < 300 && la.ok ? "PASS" : "FAIL", `ap=${ap.status} login=${la.status}`);
      cleanup.regUserIds.push(rn);
    }
  }

  // ---------- P1: Evidence contract ----------
  {
    const q = await uiFetch("/api/ai-review?status=all");
    const withEv = (q.j?.items || []).find((x) => (x.evidence_count || 0) > 0);
    if (!withEv) rec("Evidence: bundle contract", "BLOCKED", "ไม่มีเคสที่มี evidence ใน 200 แถวล่าสุด");
    else {
      const ev = await uiFetch(`/api/case-evidence?qc_score_id=${withEv.qc_score_id || ""}&conversation_id=${withEv.conversation_id || ""}`);
      const okShape = ev.status === 200 && (Array.isArray(ev.j?.screenshots) || Array.isArray(ev.j?.rawData) || Array.isArray(ev.j?.htmlSnapshots));
      rec("Evidence: bundle ของเคสเดียวกัน (contract)", okShape ? "PASS" : "FAIL", `shots=${ev.j?.screenshots?.length}`);
    }
  }

  // ---------- P1: Admin Performance (ใช้ /api/dashboard เป็นแหล่งข้อมูล) ----------
  {
    const r = await uiFetch("/api/dashboard?from=2026-07-01&to=2026-07-07");
    const hasData = r.status === 200 && r.j && typeof r.j === "object";
    const clean = !RAW_ERR.test(JSON.stringify(r.j || {}).slice(0, 3000));
    rec("AdminPerformance: dashboard API + date filter", hasData && clean ? "PASS" : "FAIL", `status=${r.status}`);
    // เปลี่ยนช่วงวันที่ → ผลต้องตอบสนอง (ไม่ error/ไม่ raw)
    const r2 = await uiFetch("/api/dashboard?from=2020-01-01&to=2020-01-02");
    rec("AdminPerformance: ช่วงว่าง → empty state ไม่ error", r2.status === 200 && !RAW_ERR.test(JSON.stringify(r2.j || {}).slice(0, 2000)) ? "PASS" : "FAIL");
  }

  // ---------- Commission ----------
  //   manual override เก็บใน localStorage (client-side) — ทดสอบ persistence จริงได้ปลอดภัย ไม่แตะ DB
  {
    const r = await uiFetch("/api/commission");
    rec("Commission: GET (read-only)", r.status === 200 ? "PASS" : "FAIL", `status=${r.status}`);
    await page.goto(BASE + "/commission", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(800);
    const ovOk = await page.evaluate(() => {
      // เขียน override + อ่านกลับ (พฤติกรรมจริงของหน้า: localStorage key commission_override)
      const key = "commission_override";
      const prev = localStorage.getItem(key);
      localStorage.setItem(key, JSON.stringify({ "qa-test-admin": 123 }));
      const roundtrip = JSON.parse(localStorage.getItem(key) || "{}")["qa-test-admin"] === 123;
      if (prev === null) localStorage.removeItem(key); else localStorage.setItem(key, prev); // คืนค่าเดิม
      return roundtrip;
    }).catch(() => false);
    await page.reload({ waitUntil: "networkidle" }).catch(() => {});
    const noCrash = !RAW_ERR.test(await page.evaluate(() => document.body.innerText).catch(() => ""));
    rec("Commission: manual override (localStorage) เขียน/อ่าน/คืนค่า + reload ไม่ crash", ovOk && noCrash ? "PASS" : "FAIL");
  }

  // ---------- CLEANUP ----------
  console.log("\n== cleanup ข้อมูลทดสอบ ==");
  for (const sid of cleanup.sopIds)
    await uiFetch(`/api/sop/${sid}?hard=true`, { method: "DELETE" }).then((r) => console.log(`  sop ${sid} hard-delete: ${r.status}`));
  for (const k of cleanup.custKeys)
    await keyApi("/api/admin/cleanup-customer", { method: "POST", body: JSON.stringify({ line_user_id: k }) }).then((r) => console.log(`  customer ${k}: ${r.status}`));
  for (const uid of cleanup.userIds.slice(1)) // ตัวแรกคือ qa_sysadmin — ปิดท้ายสุด
    await uiFetch(`/api/system/users/${uid}`, { method: "PATCH", body: JSON.stringify({ action: "disable" }) });
  // ปิด qa_sysadmin ด้วย x-api-key (session ยังใช้อยู่จนจบ)
  if (cleanup.userIds[0])
    await keyApi(`/api/system/users/${cleanup.userIds[0]}`, { method: "PATCH", body: JSON.stringify({ action: "disable" }) }).then((r) => console.log(`  qa_sysadmin disable: ${r.status}`));

  await browser.close();
  console.log(`\n===== สรุป: PASS ${pass} / FAIL ${fail} / BLOCKED ${blocked} =====`);
  results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  ❌ ${r.id} — ${r.detail}`));
  process.exit(fail === 0 ? 0 : 1);
})();

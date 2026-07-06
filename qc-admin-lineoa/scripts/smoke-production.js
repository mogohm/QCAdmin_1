// ============================================================
// smoke-production.js — ทดสอบ endpoint สำคัญบน production จริง (PASS/FAIL/BLOCKED)
//   เน้น "กันบั๊กชนิด id" (invalid input syntax for type uuid) + AI Review actions ครบ
//   ใช้: node scripts/smoke-production.js   (อ่าน QC_API_URL, QC_API_KEY, DATABASE_URL จาก .env)
//   สร้าง "เคสทดสอบแบบใช้แล้วทิ้ง" ใน ai_review_queue → ยิง action ผ่าน API จริง → ตรวจ DB → ลบทิ้ง
// ============================================================
require("dotenv").config();
const { neon } = require("@neondatabase/serverless");

const URL = (process.env.QC_API_URL || "https://qc-admin-1.vercel.app").replace(/\/$/, "");
const KEY = process.env.QC_API_KEY || process.env.ADMIN_API_KEY || "";
const DB = process.env.DATABASE_URL;
const sql = DB ? neon(DB) : null;

let pass = 0, fail = 0, blocked = 0;
const results = [];
const rec = (id, status, detail = "") => {
  results.push({ id, status, detail });
  if (status === "PASS") pass++;
  else if (status === "FAIL") fail++;
  else blocked++;
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
  console.log(`${icon} [${status}] ${id}${detail ? " — " + detail : ""}`);
};

const api = (path, opts = {}) =>
  fetch(URL + path, {
    ...opts,
    headers: { "Content-Type": "application/json", "x-api-key": KEY, ...(opts.headers || {}) },
  });

// error ต้องไม่ leak raw SQL/PostgreSQL ถึง browser
const isCleanError = (txt) =>
  !/invalid input syntax|syntax error|type uuid|column .* does not exist|relation .* does not exist|\[object Object\]/i.test(
    String(txt || ""),
  );

async function main() {
  if (!KEY) return rec("env", "BLOCKED", "ไม่มี QC_API_KEY");
  console.log(`ยิงไปที่ ${URL}\n`);

  // ---- 1) invalid id "23" → ต้อง 400 ไทย ไม่ใช่ 500 uuid error (บั๊กเดิม) ----
  {
    const r = await api("/api/ai-review/23", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    });
    const t = await r.text();
    if (r.status === 400 && isCleanError(t)) rec("ai-review PATCH id=23", "PASS", "400 + ไม่มี raw SQL");
    else rec("ai-review PATCH id=23", "FAIL", `status=${r.status} body=${t.slice(0, 120)}`);
  }

  // ---- 2) valid-uuid แต่ไม่มีจริง → 404 ไทย ----
  {
    const r = await api("/api/ai-review/3f2504e0-4f89-41d3-9a0c-0305e82c3301", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    });
    const t = await r.text();
    if ((r.status === 404 || r.status === 400) && isCleanError(t))
      rec("ai-review PATCH nonexistent uuid", "PASS", `status=${r.status}`);
    else rec("ai-review PATCH nonexistent uuid", "FAIL", `status=${r.status} body=${t.slice(0, 120)}`);
  }

  // ---- 3) วงจรจริงบนเคส disposable (ต้องมี DB) ----
  if (!sql) {
    rec("ai-review actions (disposable case)", "BLOCKED", "ไม่มี DATABASE_URL");
  } else {
    let caseId, sopId;
    try {
      const ins = await sql`
        INSERT INTO ai_review_queue (customer_name, admin_name, customer_text, admin_text,
          detected_intent, reason, status)
        VALUES ('SMOKE_TEST', 'SMOKE_ADMIN', 'ทดสอบระบบ', 'ตอบทดสอบ', 'test', 'smoke-test', 'pending')
        RETURNING id`;
      caseId = ins[0].id;

      // 3a) approve → 200 + DB status=approved + reviewed_by ไม่ null
      const ra = await api(`/api/ai-review/${caseId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "approve" }),
      });
      const ta = await ra.text();
      const row = (await sql`SELECT status, reviewed_by, reviewed_at FROM ai_review_queue WHERE id=${caseId}::uuid`)[0];
      if (ra.ok && row.status === "approved" && row.reviewed_by != null && isCleanError(ta))
        rec("action: อนุมัติผล AI", "PASS", `status=${row.status} reviewed_by=${row.reviewed_by}`);
      else rec("action: อนุมัติผล AI", "FAIL", `http=${ra.status} status=${row?.status} by=${row?.reviewed_by} body=${ta.slice(0,100)}`);

      // 3b) not_relevant → status=not_relevant
      await api(`/api/ai-review/${caseId}`, { method: "PATCH", body: JSON.stringify({ action: "not_relevant" }) });
      const row2 = (await sql`SELECT status FROM ai_review_queue WHERE id=${caseId}::uuid`)[0];
      rec("action: ไม่เกี่ยว QC", row2.status === "not_relevant" ? "PASS" : "FAIL", `status=${row2.status}`);

      // 3c) correct intent → status=corrected + corrected_intent
      await api(`/api/ai-review/${caseId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "correct", corrected_intent: "poker" }),
      });
      const row3 = (await sql`SELECT status, corrected_intent FROM ai_review_queue WHERE id=${caseId}::uuid`)[0];
      rec("action: แก้ Intent", row3.status === "corrected" && row3.corrected_intent === "poker" ? "PASS" : "FAIL", `status=${row3.status} intent=${row3.corrected_intent}`);

      // 3d) create-sop → 200 + sop row + source_case_id ชนิดถูก
      const topic = "SMOKE_SOP_" + Date.now();
      const rs = await api(`/api/ai-review/${caseId}/create-sop`, {
        method: "POST",
        body: JSON.stringify({ topic, answer: "คำตอบทดสอบ", intent: "test" }),
      });
      const ts = await rs.text();
      let sopOk = false;
      try {
        const j = JSON.parse(ts);
        sopId = j.sop?.id;
        const sopRow = sopId ? (await sql`SELECT id, source_case_id FROM sop_scripts WHERE id=${sopId}`)[0] : null;
        sopOk = rs.ok && !!sopRow;
      } catch {}
      rec("action: สร้าง SOP + สอน AI", sopOk && isCleanError(ts) ? "PASS" : "FAIL", `http=${rs.status} sopId=${sopId} body=${ts.slice(0,100)}`);

      // cleanup
      if (sopId) await sql`DELETE FROM sop_scripts WHERE id=${sopId}`.catch(() => {});
      await sql`DELETE FROM ai_review_queue WHERE id=${caseId}::uuid`.catch(() => {});
      console.log("   🧹 ลบเคส/SOP ทดสอบเรียบร้อย");
    } catch (e) {
      rec("ai-review actions (disposable case)", "FAIL", e.message);
      if (caseId) await sql`DELETE FROM ai_review_queue WHERE id=${caseId}::uuid`.catch(() => {});
      if (sopId) await sql`DELETE FROM sop_scripts WHERE id=${sopId}`.catch(() => {});
    }
  }

  // ---- 4) โหลด endpoint สาธารณะสำคัญ (ไม่ควร 500 / ไม่ leak raw error) ----
  for (const p of ["/api/ai-review?status=pending", "/api/scraper/job", "/api/sop"]) {
    try {
      const r = await api(p);
      const t = await r.text();
      if (r.status < 500 && isCleanError(t)) rec(`GET ${p}`, "PASS", `status=${r.status}`);
      else rec(`GET ${p}`, "FAIL", `status=${r.status} body=${t.slice(0, 100)}`);
    } catch (e) {
      rec(`GET ${p}`, "FAIL", e.message);
    }
  }

  console.log(`\n===== สรุป: PASS ${pass} / FAIL ${fail} / BLOCKED ${blocked} =====`);
  process.exit(fail === 0 ? 0 : 1);
}
main();

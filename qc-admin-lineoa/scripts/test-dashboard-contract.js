// ============================================================
// test-dashboard-contract.js — สัญญาข้อมูล batch: canonical case_date +
//   marketing contract + partial-data warning + commission tx + ai-review pagination
//   รัน: node scripts/test-dashboard-contract.js
// ============================================================
const fs = require("fs");
const path = require("path");
const R = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

let pass = 0, fail = 0;
const t = (name, cond, x = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "✅" : "❌"} ${name}${x && !cond ? " — " + x : ""}`);
};

console.log("\n== 1) Canonical QC case date ==");
{
  const dash = R("app/api/dashboard/route.js");
  const runner = R("lib/qc-runner.js");
  const mig = R("app/api/admin/migrate-uat/route.js");
  const schema = R("sql/schema.sql");
  t("qc-runner INSERT มี case_date (วัน Bangkok ของข้อความลูกค้า)", /case_date/.test(runner) && /customerCreatedAt \|\| createdAt/.test(runner));
  t("case_ref ใหม่ใช้ case_date (นิยามเดียวกับ ai_review_queue)", /to_char\(COALESCE\(case_date/.test(runner));
  t("migrate: ADD case_date + backfill จาก messages(customer) + index", /ADD COLUMN IF NOT EXISTS case_date DATE/.test(mig) && /m\.id = q2\.customer_message_id/.test(mig) && /idx_qc_scores_case_date/.test(mig));
  t("schema.sql มี case_date + index", /case_date DATE/.test(schema) && /idx_qc_scores_case_date/.test(schema));
  // dashboard ห้ามเหลือ filter แบบเก่า (UTC + เวลาแอดมิน) กับ qc_scores
  t("dashboard ไม่เหลือ `created_at BETWEEN from AND to+1day` เลย", !/BETWEEN \$\{dateFrom\}::date AND \(\$\{dateTo\}::date \+ interval '1 day'\)/.test(dash));
  const nCase = (dash.match(/COALESCE\(q?\.?case_date/g) || []).length + (dash.match(/COALESCE\(case_date/g) || []).length;
  t(`dashboard ใช้ case_date ทุกจุด qc_scores (${nCase} จุด ≥ 15)`, nCase >= 15);
  t("messages/customer_events ใช้หน้าต่าง Bangkok (−7h..+17h, ใช้ index ได้)", /interval '7 hours'/.test(dash) && /interval '17 hours'/.test(dash));
  t("debug/counts นับ qc_by_day ตาม case_date", /COALESCE\(case_date/.test(R("app/api/debug/counts/route.js")));
}

console.log("\n== 2) Marketing dashboard API contract ==");
{
  const dash = R("app/api/dashboard/route.js");
  t("kpi zero-fill เสมอ (ไม่มี undefined เมื่อ query พัง)", /const kpi = \{/.test(dash) && /customers: k0\.customers \|\| 0/.test(dash));
  t("kpi มี alias registration_pass (ชื่อเดียวกับ marketingSummary)", /registration_pass: k0\.registered_pass \|\| 0/.test(dash));
  t("marketingSummary ยัง zero-fill ครบทุก field", /registration_fail: m0\.registration_fail \|\| 0/.test(dash) && /withdraw_total: Number\(m0\.withdraw_total \|\| 0\)/.test(dash));
}

console.log("\n== 3) Dashboard partial-data warning ==");
{
  const dash = R("app/api/dashboard/route.js");
  t("API มี scraperCoverage (จาก scraper_jobs done ต่อวัน)", /scraperCoverage/.test(dash) && /status === "done"/.test(dash));
  t("นับถึงแค่เมื่อวาน (Bangkok) — วันนี้ยังเก็บไม่ได้ไม่นับว่าขาด", /bkkYesterday/.test(dash));
  t("ช่วง default (2000-01-01) ไม่สแกนทั้งประวัติ", /covFrom > covTo|2020-01-01/.test(dash));
  t("UI marketing-dashboard มี banner ข้อมูลไม่ครบ", /ข้อมูลช่วงนี้อาจยังไม่ครบ/.test(R("app/marketing-dashboard/page.js")));
  t("UI หน้าแรก (Panel 4) มี banner ข้อมูลไม่ครบ", /ข้อมูลอาจไม่ครบ/.test(R("app/page.js")));
  t("banner แยกจาก 'ไม่มีข้อมูล[ในช่วงวันที่นี้]' (ยังคง empty state เดิม)", /ยังไม่มีข้อมูลในช่วงวันที่นี้/.test(R("app/marketing-dashboard/page.js")));
}

console.log("\n== 4) Commission transaction safety ==");
{
  const db = R("lib/db.js");
  const com = R("app/api/commission/route.js");
  const mig = R("app/api/admin/migrate-uat/route.js");
  t("lib/db มี transaction() (neon batch — atomic)", /export async function transaction/.test(db) && /s\.transaction\(/.test(db));
  t("commission POST ใช้ transaction เดียว (DELETE + INSERT ทั้งชุด)", /await transaction\(\(tx\) => \[/.test(com) && /tx`DELETE FROM admin_commissions/.test(com));
  t("ไม่มี await query ทีละแถวใน loop แล้ว", !/for \(const r of rows\)/.test(com));
  t("ตรวจ admin ครั้งเดียวด้วย ANY(uuid[]) ก่อนเข้า transaction", /ANY\(\$\{ids\}::uuid\[\]\)/.test(com));
  t("migrate: dedup แล้วสร้าง unique (admin_id, period)", /uq_admin_commissions_period/.test(mig) && /a\.id < b\.id/.test(mig));
  t("schema.sql มี unique index", /uq_admin_commissions_period/.test(R("sql/schema.sql")));
}

console.log("\n== 5) AI Review pagination ==");
{
  const api = R("app/api/ai-review/route.js");
  const ui = R("app/ai-review/page.js");
  t("API รับ page/limit (clamp ≤100) + OFFSET", /Math\.min\(100/.test(api) && /LIMIT \$\{limit\} OFFSET \$\{offset\}/.test(api));
  t("API คืน total/page/pages/limit", /total,\s*\n?\s*page,/.test(api) && /pages: Math\.max\(1, Math\.ceil\(total \/ limit\)\)/.test(api));
  t("ไม่เหลือ LIMIT 200 ตายตัว", !/LIMIT 200/.test(api));
  t("UI ส่ง page+limit และมีปุ่ม ก่อนหน้า/ถัดไป", /page=\$\{p\}&limit=\$\{LIMIT\}/.test(ui) && /ก่อนหน้า/.test(ui) && /ถัดไป/.test(ui));
  t("UI reset หน้า 1 เมื่อเปลี่ยน filter", /setPage\(1\);\s*\n?\s*load\(1\)/.test(ui));
  t("UI กันหน้าเกินท้าย (คิวหดหลังตรวจ)", /p > d\.pages/.test(ui));
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ผ่าน ${pass} / ล้มเหลว ${fail}`);
process.exit(fail ? 1 : 0);

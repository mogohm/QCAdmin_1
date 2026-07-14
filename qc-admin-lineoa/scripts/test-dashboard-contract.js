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

console.log("\n== 1) Canonical QC case_at (timestamptz, admin→customer→created_at) ==");
{
  const dash = R("app/api/dashboard/route.js");
  const runner = R("lib/qc-runner.js");
  const mig = R("app/api/admin/migrate-uat/route.js");
  const schema = R("sql/schema.sql");
  const insights = R("app/api/qc/insights/route.js");
  const counts = R("app/api/debug/counts/route.js");
  const replies = R("app/api/replies/route.js");
  // qc-runner: case_at = admin msg → customer msg → created_at
  t("qc-runner INSERT ตั้ง case_at (admin msg → customer msg → created_at)",
    /case_at/.test(runner) && /SELECT created_at FROM messages WHERE id = \$\{adminMessageId\}/.test(runner) && /SELECT created_at FROM messages WHERE id = \$\{customerMessageId\}/.test(runner));
  // migrate: add case_at + backfill (admin→customer→created_at) + null=0 guard + index + report
  t("migrate: ADD case_at + backfill admin→customer→created_at",
    /ADD COLUMN IF NOT EXISTS case_at TIMESTAMPTZ/.test(mig) && /COALESCE\(am\.created_at, cm\.created_at, q2\.created_at\)/.test(mig) && /am\.id = q2\.admin_message_id/.test(mig));
  t("migrate: null=0 guard + index + report", /case_at = created_at WHERE case_at IS NULL/.test(mig) && /idx_qc_scores_case_at/.test(mig) && /case_at_report/.test(mig));
  t("schema.sql มี case_at + index", /case_at TIMESTAMPTZ/.test(schema) && /idx_qc_scores_case_at/.test(schema));
  // dashboard: qc_scores ต้องกรองด้วย case_at (Bangkok window) — ไม่เหลือ case_date/created_at filter
  t("dashboard ไม่เหลือ case_date เลย", !/case_date/.test(dash));
  t("dashboard ไม่เหลือ qc created_at::date filter แบบเก่า", !/BETWEEN \$\{dateFrom\}::date AND \(\$\{dateTo\}::date \+ interval '1 day'\)/.test(dash));
  const nCaseAt = (dash.match(/case_at >=|case_at AT TIME ZONE/g) || []).length;
  t(`dashboard ใช้ case_at ทุกจุด qc_scores (${nCaseAt} จุด ≥ 15)`, nCaseAt >= 15);
  // insights (QC Dashboard): case_at + Bangkok instant (+07)
  t("insights ใช้ case_at + ขอบเขต +07", /q?\.?case_at BETWEEN/.test(insights) && /00:00:00\+07/.test(insights) && !/qc_scores WHERE created_at/.test(insights));
  // debug/counts + replies (Chat Review)
  t("debug/counts qc_by_day = case_at", /case_at AT TIME ZONE 'Asia\/Bangkok'\)::date::text/.test(counts));
  t("replies (Chat Review) ขอบเขต Bangkok (−7h..+17h)", /m\.created_at >= \$1::date - interval '7 hours'/.test(replies));
  // case_ref/evidence ไม่ถูกแตะ: case_date ยังอยู่ใน schema/runner (คนละเรื่องกับ analytics)
  t("case_date ยังอยู่ (case_ref/evidence ไม่ถูกแตะ)", /case_date/.test(schema) && /case_date/.test(runner));
}

console.log("\n== 1b) REGRESSION: msg 07-07 / qc created 07-08 → นับวัน 07-07 (case_at) ==");
{
  // จำลอง SQL window ของ dashboard: case_at >= D::date - 7h AND case_at < D::date + 17h  (UTC)
  const inDay = (caseAtISO, D) => {
    const t0 = new Date(`${D}T00:00:00Z`).getTime();
    const lo = t0 - 7 * 3600e3, hi = t0 + 17 * 3600e3; // Bangkok day = [D-1 17:00Z, D 17:00Z)
    const c = new Date(caseAtISO).getTime();
    return c >= lo && c < hi;
  };
  // เคส: ข้อความแอดมินตอบ 2026-07-07 (case_at) แต่ scrape/qc created_at = 2026-07-08
  const caseAt = "2026-07-07T10:00:00+07:00"; // = 2026-07-07T03:00:00Z
  t("dashboard วัน 2026-07-07 นับเคสนี้ (case_at)", inDay(caseAt, "2026-07-07") === true);
  t("dashboard วัน 2026-07-08 ไม่นับเคสนี้ (ไม่ใช่วัน scrape)", inDay(caseAt, "2026-07-08") === false);
  // ขอบเขตข้ามเที่ยงคืน Bangkok: 2026-07-07T23:30+07 = 16:30Z ยังเป็นวัน 07-07
  t("23:30 Bangkok ยังเป็นวัน 07-07", inDay("2026-07-07T23:30:00+07:00", "2026-07-07") === true);
  t("00:30 Bangkok ของ 07-08 ไม่ตกวัน 07-07", inDay("2026-07-08T00:30:00+07:00", "2026-07-07") === false);
  // reconciliation endpoint + script มีจริง
  t("มี /api/debug/date-reconcile", fs.existsSync(path.join(__dirname, "..", "app", "api", "debug", "date-reconcile", "route.js")));
  t("มี scripts/reconcile-dates.js (comprehensive)", fs.existsSync(path.join(__dirname, "..", "scripts", "reconcile-dates.js")));
  // ai_review orphan hygiene: migrate ต้องลบ orphan + เพิ่ม FK CASCADE, schema มี FK, มี audit
  const migh = R("app/api/admin/migrate-uat/route.js");
  t("migrate: ลบ ai_review orphan", /DELETE FROM ai_review_queue r[\s\S]*?NOT EXISTS \(SELECT 1 FROM qc_scores/.test(migh));
  t("migrate: เพิ่ม FK ON DELETE CASCADE (idempotent)", /fk_ai_review_qc_score/.test(migh) && /REFERENCES qc_scores\(id\) ON DELETE CASCADE/.test(migh) && /pg_constraint/.test(migh));
  t("schema.sql ai_review_queue มี FK CASCADE", /qc_score_id UUID REFERENCES qc_scores\(id\) ON DELETE CASCADE/.test(R("sql/schema.sql")));
  t("debug/counts รายงาน ai_review_orphans", /ai_review_orphans/.test(R("app/api/debug/counts/route.js")));
  t("มี scripts/audit-ai-review-orphan.js", fs.existsSync(path.join(__dirname, "..", "scripts", "audit-ai-review-orphan.js")));
  // UI help text: case_ref = วันลูกค้า, dashboard = วันแอดมินตอบ (expected difference)
  t("AI Review page อธิบาย case_ref = วันลูกค้าติดต่อ", /รหัสเคส[\s\S]*วันที่ลูกค้าติดต่อ/.test(R("app/ai-review/page.js")));
  t("QC Dashboard อธิบายวันที่ = วันประเมิน QC (แอดมินตอบ)", /วันที่ประเมิน QC \(วันที่แอดมินตอบ\)/.test(R("app/qc-dashboard/page.js")));
  // reconcile-dates ต้องเทียบทุก module ที่นับเคส
  const recon = R("scripts/reconcile-dates.js");
  t("reconcile เทียบครบทุก module", ["dashboard_total_cases", "ranking_case_sum", "commission_case_count", "chat_review_rows", "ai_review_queue_count", "evidence_exact_verified", "manual_cases_count", "disputes_count", "scraperCoverage"].every((k) => recon.includes(k)));
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

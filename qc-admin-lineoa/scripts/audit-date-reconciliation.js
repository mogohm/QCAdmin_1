// ============================================================
// audit-date-reconciliation.js — reconcile ทุกแหล่งของ "วันธุรกิจ Asia/Bangkok"
//   ตามนิยาม canonical case_at (P1). mark แต่ละบรรทัด: EXPECTED / EXPLAINED / BUG
//   รัน:  node scripts/audit-date-reconciliation.js --date=2026-07-07 [--date=...]
//         (ไม่ระบุ → เลือก 3 วันล่าสุดที่ scraper done)
//   Acceptance: unexplained mismatch (BUG) = 0 ทุกวัน
// ============================================================
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const B = (process.env.QC_API_URL || "").replace(/\/$/, "");
const K = process.env.QC_API_KEY || process.env.ADMIN_API_KEY || "";
const api = (e) => fetch(`${B}${e}`, { headers: { "x-api-key": K } }).then((r) => r.json());

(async () => {
  if (!B) { console.error("ตั้ง QC_API_URL ใน .env ก่อน"); process.exit(1); }
  let dates = process.argv.filter((a) => a.startsWith("--date=")).map((a) => a.slice(7));
  if (!dates.length) {
    const jobs = await api("/api/scraper/job").catch(() => []);
    dates = [...new Set((Array.isArray(jobs) ? jobs : []).filter((j) => j.status === "done").map((j) => String(j.date_from).slice(0, 10)))]
      .sort().reverse().slice(0, 3);
  }
  if (!dates.length) { console.log("ไม่มีวันให้ตรวจ"); process.exit(1); }

  let bugs = 0;
  const rowsForTable = [];
  for (const date of dates) {
    const d = await api(`/api/debug/date-reconcile?date=${date}`);
    if (d.error) { console.log(`\n===== ${date} ===== ❌ ${d.error}`); bugs++; continue; }
    const x = d._explain;
    // กติกา reconcile: [label, value, verdict, note]
    const checks = [];
    const mark = (label, value, verdict, note = "") => checks.push({ label, value, verdict, note });

    mark("messages_total", d.messages_total, "INFO");
    mark("customer_messages", d.customer_messages, "INFO");
    mark("admin_messages", d.admin_messages, "INFO");
    // messages_total = customer + admin + อื่น ๆ (system)
    mark("  ↳ split", `${d.customer_messages}+${d.admin_messages}+${x.non_cust_admin_messages}`,
      d.customer_messages + d.admin_messages + x.non_cust_admin_messages === d.messages_total ? "EXPECTED" : "BUG",
      "cust+admin+system = total");

    mark("qc_scores_by_case_at", d.qc_scores_by_case_at, "INFO");
    // dashboard ต้อง = qc_by_case_at เป๊ะ (แหล่งเดียวกัน case_at)
    mark("dashboard_total_cases", d.dashboard_total_cases,
      d.dashboard_total_cases === d.qc_scores_by_case_at ? "EXPECTED" : "BUG",
      "= qc_scores_by_case_at");
    // ranking_case_sum + qc ไม่มี admin + qc admin inactive = qc ทั้งหมด
    mark("ranking_case_sum", d.ranking_case_sum,
      d.ranking_case_sum + x.qc_no_admin + x.qc_inactive_admin === d.qc_scores_by_case_at ? "EXPLAINED" : "BUG",
      `+no_admin(${x.qc_no_admin})+inactive(${x.qc_inactive_admin}) = qc`);
    // commission = ranking (cases ที่ป้อนสูตรค่าคอม)
    mark("commission_case_count", d.commission_case_count,
      d.commission_case_count === d.ranking_case_sum ? "EXPECTED" : "BUG",
      "= ranking_case_sum");
    // chat_review = admin messages ที่มี admin_id; ส่วนต่าง = admin msg ไม่มี id
    mark("chat_review_rows", d.chat_review_rows,
      d.chat_review_rows + x.admin_messages_without_id === d.admin_messages ? "EXPLAINED" : "BUG",
      `+no_id(${x.admin_messages_without_id}) = admin_messages`);
    // ai_review = ตารางแยก คีย์ด้วย timestamp ของตัวเอง — ไม่ใช่ subset ต่อวันของ qc
    //   BUG เฉพาะเมื่อมี ai_review row ที่ qc_score_id ชี้ไปเคสที่ไม่มีอยู่ (dangling)
    mark("ai_review_queue_count", d.ai_review_queue_count,
      x.ai_review_no_qc_link === 0 ? "EXPLAINED" : "BUG",
      `same_day(${x.ai_review_qc_same_day})+diff_day(${x.ai_review_qc_diff_day})+no_qc(${x.ai_review_no_qc_link}) — ตารางแยก ฐานวันต่าง`);
    // evidence exact verified — subset ของ qc
    mark("evidence_exact_verified", d.evidence_exact_verified,
      d.evidence_exact_verified <= d.qc_scores_by_case_at ? "EXPLAINED" : "BUG",
      "subset ของ qc");
    // guard: case_at ต้องไม่มี null เลยทั้งตาราง
    mark("qc_case_at_null(all)", x.qc_case_at_null_total,
      x.qc_case_at_null_total === 0 ? "EXPECTED" : "BUG", "ต้อง = 0");

    console.log(`\n===== ${date} (Asia/Bangkok) =====`);
    for (const c of checks) {
      const tag = c.verdict === "BUG" ? "❌ BUG" : c.verdict === "INFO" ? "  ·  " : c.verdict === "EXPECTED" ? "✅ EXPECTED" : "🟡 EXPLAINED";
      if (c.verdict === "BUG") bugs++;
      console.log(`  ${String(c.label).padEnd(24)} ${String(c.value).padStart(8)}  ${tag}${c.note ? "  (" + c.note + ")" : ""}`);
    }
    rowsForTable.push({
      date, chat_review: d.chat_review_rows, dashboard: d.dashboard_total_cases,
      ranking: d.ranking_case_sum, commission: d.commission_case_count,
      ai_review: d.ai_review_queue_count,
      mismatch_status: checks.some((c) => c.verdict === "BUG") ? "BUG" : "OK",
    });
  }

  console.log("\n===== ตารางสรุป (spec P1-6) =====");
  console.log("date        chat_review dashboard ranking commission ai_review status");
  for (const r of rowsForTable)
    console.log(`${r.date}  ${String(r.chat_review).padStart(9)} ${String(r.dashboard).padStart(9)} ${String(r.ranking).padStart(7)} ${String(r.commission).padStart(10)} ${String(r.ai_review).padStart(9)}  ${r.mismatch_status}`);

  console.log(`\n${bugs === 0 ? "✅ RECONCILE PASS — unexplained mismatch = 0" : `❌ พบ ${bugs} BUG (unexplained mismatch)`}`);
  process.exit(bugs === 0 ? 0 : 1);
})();

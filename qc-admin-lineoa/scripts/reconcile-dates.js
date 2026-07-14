// ============================================================
// reconcile-dates.js — Production Date Reconciliation (canonical case_at)
//   เทียบ "ทุก module ที่นับจำนวนเคส" ต่อวันธุรกิจ Asia/Bangkok:
//     scraper job · messages(total/customer/admin) · qc_scores_by_case_at ·
//     chat_review · dashboard(cases/chats) · ranking · commission · ai_review ·
//     evidence_exact_verified · manual_cases · disputes · scraperCoverage
//   แหล่งข้อมูล: production DB จริง ผ่าน /api/debug/date-reconcile + /api/dashboard + /api/scraper/job
//   แต่ละบรรทัด mark: PASS(EXPECTED) / EXPLAINED / BUG ; DATA-HYGIENE แยกจาก DATE-correctness
//
//   รัน:  node scripts/reconcile-dates.js --date=2026-07-12 --date=2026-07-06 --date=2026-07-08
//         (ไม่ระบุ → 3 วันล่าสุดที่ scraper done)
//   Acceptance: unexplained DATE mismatch (BUG) = 0
// ============================================================
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const B = (process.env.QC_API_URL || "").replace(/\/$/, "");
const K = process.env.QC_API_KEY || process.env.ADMIN_API_KEY || "";
const api = (e) => fetch(`${B}${e}`, { headers: { "x-api-key": K } }).then((r) => r.json());

(async () => {
  if (!B) { console.error("ตั้ง QC_API_URL ใน .env ก่อน"); process.exit(1); }
  let dates = process.argv.filter((a) => a.startsWith("--date=")).map((a) => a.slice(7));
  if (!dates.length) dates = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const jobs = await api("/api/scraper/job").catch(() => []);
  const jl = Array.isArray(jobs) ? jobs : [];
  if (!dates.length) {
    dates = [...new Set(jl.filter((j) => j.status === "done").map((j) => String(j.date_from).slice(0, 10)))]
      .sort().reverse().slice(0, 3);
  }
  if (!dates.length) { console.log("ไม่มีวันให้ตรวจ"); process.exit(1); }
  const jobStatus = (d) => {
    const js = jl.filter((j) => String(j.date_from).slice(0, 10) <= d && String(j.date_to).slice(0, 10) >= d);
    const done = js.find((j) => j.status === "done");
    if (done) return `done (${done.counters?.processed_chats ?? "?"} ห้อง)`;
    return js[0]?.status || "aged-out (data ยังอยู่)";
  };

  let bugs = 0;
  const table = [];
  for (const date of dates) {
    const d = await api(`/api/debug/date-reconcile?date=${date}`);
    const cov = await api(`/api/dashboard?from=${date}&to=${date}`).then((j) => j.scraperCoverage).catch(() => null);
    if (d.error) { console.log(`\n===== ${date} ===== ❌ ${d.error}`); bugs++; continue; }
    const x = d._explain;
    const rows = [];
    const R = (label, value, verdict, note = "") => rows.push({ label, value, verdict, note });

    // ---- INFO (ตัวตั้ง) ----
    R("scraper_job", jobStatus(date), "INFO");
    R("messages_total", d.messages_total, "INFO");
    R("customer_messages", d.customer_messages, "INFO");
    R("admin_messages", d.admin_messages, "INFO");
    R("qc_scores_by_case_at", d.qc_scores_by_case_at, "INFO");

    // ---- DATE-correctness checks (case_at) ----
    R("  cust+admin+system", `${d.customer_messages}+${d.admin_messages}+${x.non_cust_admin_messages}`,
      d.customer_messages + d.admin_messages + x.non_cust_admin_messages === d.messages_total ? "EXPECTED" : "BUG", "= messages_total");
    R("dashboard_total_cases", d.dashboard_total_cases,
      d.dashboard_total_cases === d.qc_scores_by_case_at ? "EXPECTED" : "BUG", "= qc_scores_by_case_at");
    R("dashboard_total_chats", d.dashboard_total_chats,
      d.dashboard_total_chats === d.messages_total ? "EXPECTED" : "BUG", "= messages_total");
    R("ranking_case_sum", d.ranking_case_sum,
      d.ranking_case_sum + x.qc_no_admin + x.qc_inactive_admin === d.qc_scores_by_case_at ? "EXPLAINED" : "BUG",
      `+no_admin(${x.qc_no_admin})+inactive(${x.qc_inactive_admin}) = qc`);
    R("commission_case_count", d.commission_case_count,
      d.commission_case_count === d.ranking_case_sum ? "EXPECTED" : "BUG", "= ranking_case_sum");
    R("chat_review_rows", d.chat_review_rows,
      d.chat_review_rows + x.admin_messages_without_id === d.admin_messages ? "EXPLAINED" : "BUG",
      `+no_admin_id(${x.admin_messages_without_id}) = admin_messages`);
    R("manual_cases_count", d.manual_cases_count, "EXPLAINED", "subset ของ qc (source=manual)");
    R("disputes_count", d.disputes_count,
      d.disputes_count <= d.qc_scores_by_case_at ? "EXPLAINED" : "BUG", "subset ของ qc (dispute ต่อเคส)");
    R("evidence_exact_verified", d.evidence_exact_verified,
      d.evidence_exact_verified <= d.qc_scores_by_case_at ? "EXPLAINED" : "BUG", "subset ของ qc (verify แล้ว)");
    R("ai_review_queue_count", d.ai_review_queue_count, "EXPLAINED",
      `same_day(${x.ai_review_qc_same_day})+diff_day(${x.ai_review_qc_diff_day})+orphan(${x.ai_review_no_qc_link}) — ตารางแยก`);
    R("scraperCoverage", cov ? (cov.complete ? "complete" : `missing ${cov.days_missing}`) : "n/a",
      !cov || cov.checked === false ? "INFO" : cov.complete ? "EXPECTED" : "EXPLAINED", "scraper ครบวันไหม");
    R("qc_case_at_null(all)", x.qc_case_at_null_total, x.qc_case_at_null_total === 0 ? "EXPECTED" : "BUG", "ต้อง = 0");

    // ---- DATA-HYGIENE (แยกจาก date verdict) ----
    if (x.ai_review_no_qc_link)
      R("  ↳ ai_review orphan", x.ai_review_no_qc_link, "HYGIENE",
        `dangling(${x.ai_review_qc_id_dangling ?? "?"})/null(${x.ai_review_qc_id_null ?? "?"}) — qc ถูกลบ · ไม่เกี่ยว case_at`);

    console.log(`\n===== ${date} (Asia/Bangkok) =====`);
    for (const c of rows) {
      const tag = { BUG: "❌ BUG", INFO: "  ·  ", EXPECTED: "✅ EXPECTED", EXPLAINED: "🟡 EXPLAINED", HYGIENE: "⚠️  HYGIENE" }[c.verdict];
      if (c.verdict === "BUG") bugs++;
      console.log(`  ${String(c.label).padEnd(24)} ${String(c.value).padStart(11)}  ${tag}${c.note ? "  (" + c.note + ")" : ""}`);
    }
    table.push({
      date, job: jobStatus(date), messages_total: d.messages_total,
      cust: d.customer_messages, admin: d.admin_messages, qc: d.qc_scores_by_case_at,
      chat_review: d.chat_review_rows, dashboard: d.dashboard_total_cases,
      ranking: d.ranking_case_sum, commission: d.commission_case_count,
      ai_review: d.ai_review_queue_count, evidence: d.evidence_exact_verified,
      manual: d.manual_cases_count, disputes: d.disputes_count,
      status: rows.some((c) => c.verdict === "BUG") ? "BUG"
        : rows.some((c) => c.verdict === "EXPLAINED" || c.verdict === "HYGIENE") ? "EXPLAINED" : "PASS",
    });
  }

  console.log("\n===== ตารางสรุป production reconciliation =====");
  console.log("date        job          msgs cust admin  qc chat_rev dash rank comm ai_rev evid manual disp  status");
  for (const r of table)
    console.log(
      `${r.date}  ${String(r.job).padEnd(11).slice(0, 11)} ${String(r.messages_total).padStart(5)} ${String(r.cust).padStart(4)} ${String(r.admin).padStart(5)} ${String(r.qc).padStart(4)} ${String(r.chat_review).padStart(7)} ${String(r.dashboard).padStart(4)} ${String(r.ranking).padStart(4)} ${String(r.commission).padStart(4)} ${String(r.ai_review).padStart(6)} ${String(r.evidence).padStart(4)} ${String(r.manual).padStart(5)} ${String(r.disputes).padStart(4)}  ${r.status}`,
    );

  console.log(`\n${bugs === 0 ? "✅ RECONCILE PASS — unexplained DATE mismatch = 0" : `❌ พบ ${bugs} BUG (unexplained DATE mismatch)`}`);
  process.exit(bugs === 0 ? 0 : 1);
})();

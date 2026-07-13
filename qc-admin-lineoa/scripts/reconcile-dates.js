// ============================================================
// reconcile-dates.js — Production reconciliation ต่อวัน (นิยาม canonical case_date)
//   เทียบ 4 แหล่งต่อวัน D (Bangkok):
//     1. scraper_jobs (counters: processed/target, messages_inserted, qc_pairs_created)
//     2. /api/dashboard?from=D&to=D → kpiExt.totalQcCases (case_date), totalChats,
//        marketingSummary, scraperCoverage
//     3. /api/debug/counts → qc_by_day / messages_by_day (7 วันล่าสุด)
//   รัน:  node scripts/reconcile-dates.js                 (เลือก 3 วันล่าสุดที่ scraper done)
//         node scripts/reconcile-dates.js 2026-07-07 ...  (ระบุวันเอง)
// ============================================================
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const B = (process.env.QC_API_URL || "").replace(/\/$/, "");
const K = process.env.QC_API_KEY || process.env.ADMIN_API_KEY || "";
const api = (e) =>
  fetch(`${B}${e}`, { headers: { "x-api-key": K } }).then((r) => r.json());

(async () => {
  if (!B) { console.error("ตั้ง QC_API_URL ใน .env ก่อน"); process.exit(1); }
  const jobs = await api("/api/scraper/job");
  const list = Array.isArray(jobs) ? jobs : [];
  let dates = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  if (!dates.length) {
    dates = [...new Set(list.filter((j) => j.status === "done").map((j) => String(j.date_from).slice(0, 10)))]
      .sort().reverse().slice(0, 3);
  }
  if (!dates.length) { console.log("ไม่มีวันที่ scraper done ให้ตรวจ"); process.exit(1); }
  console.log(`Reconcile ${dates.length} วัน: ${dates.join(", ")}\n`);

  const dbg = await api("/api/debug/counts").catch(() => ({}));
  const byDay = (arr, d) => (arr || []).find((x) => x.d === d)?.n ?? null;

  let warns = 0;
  for (const d of dates) {
    const doneJobs = list.filter((j) => j.status === "done" && String(j.date_from).slice(0, 10) <= d && String(j.date_to).slice(0, 10) >= d);
    const c = doneJobs.reduce((s, j) => {
      const cc = j.counters || {};
      s.msgs += Number(cc.messages_inserted || j.logged_count || 0);
      s.pairs += Number(cc.qc_pairs_created || 0);
      s.proc += Number(cc.processed_chats || 0);
      s.target += Number(cc.target_date_chats || j.total_chats || 0);
      return s;
    }, { msgs: 0, pairs: 0, proc: 0, target: 0 });

    const dash = await api(`/api/dashboard?from=${d}&to=${d}`).catch(() => ({}));
    const qcDash = dash?.kpiExt?.totalQcCases ?? null;
    const chatDash = dash?.kpiExt?.totalChats ?? null;
    const cov = dash?.scraperCoverage || {};
    const qcDbg = byDay(dbg.qc_by_day, d);
    const msgDbg = byDay(dbg.messages_by_day, d);

    console.log(`===== ${d} =====`);
    console.log(`  scraper jobs done ครอบวันนี้ : ${doneJobs.length} งาน · เปิดห้อง ${c.proc}/${c.target} · insert ${c.msgs} msgs · สร้าง ${c.pairs} QC pairs`);
    console.log(`  dashboard (case_date)        : QC cases = ${qcDash} · messages (Bangkok) = ${chatDash}`);
    console.log(`  debug/counts (7 วันล่าสุด)   : qc_by_day = ${qcDbg ?? "นอกช่วง"} · messages_by_day = ${msgDbg ?? "นอกช่วง"}`);
    console.log(`  scraperCoverage              : checked=${cov.checked} complete=${cov.complete} missing=${cov.days_missing ?? "-"}`);

    // ---- กติกา reconcile ----
    const w = [];
    if (cov.checked && cov.complete === false) w.push("coverage บอกข้อมูลไม่ครบ ทั้งที่มี job done");
    if (qcDbg != null && qcDash != null && qcDbg !== qcDash) w.push(`QC dashboard (${qcDash}) ≠ debug qc_by_day (${qcDbg}) — นิยามวันไม่ตรงกัน?`);
    if (msgDbg != null && chatDash != null && msgDbg !== chatDash) w.push(`messages dashboard (${chatDash}) ≠ debug (${msgDbg})`);
    if (qcDash != null && c.pairs > 0 && qcDash < c.pairs) w.push(`QC cases บน dashboard (${qcDash}) น้อยกว่า pairs ที่ scraper สร้าง (${c.pairs})`);
    if (chatDash != null && c.msgs > 0 && chatDash < c.msgs) w.push(`messages วันนี้ (${chatDash}) น้อยกว่าที่ scraper insert (${c.msgs})`);
    if (w.length) { warns += w.length; w.forEach((x) => console.log(`  ⚠️ ${x}`)); }
    else console.log("  ✅ ตัวเลขสอดคล้องกัน (dashboard = debug, ครอบคลุมสิ่งที่ scraper เขียน)");
    console.log("");
  }
  console.log(warns ? `❌ พบ ${warns} ข้อไม่สอดคล้อง` : "✅ RECONCILE PASS — ทุกวันตัวเลขตรงตามนิยาม canonical case_date");
  process.exit(warns ? 1 : 0);
})();

// ============================================================
// repair-stuck-auth-job.js — P0-10: ซ่อม job ที่ค้าง running/pending เพราะ
//   worker ตายจาก LINE session expired (ห้ามลบ — ตั้งเป็น blocked_auth ให้ resume ได้)
//   เงื่อนไขซ่อม: status=running และ updated_at เก่ากว่า 3 นาที (worker ตายแล้ว)
//   รัน: node scripts/repair-stuck-auth-job.js          (ดูอย่างเดียว)
//        node scripts/repair-stuck-auth-job.js --fix    (ซ่อมจริง)
// ============================================================
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const API_URL = (process.env.QC_API_URL || "").replace(/\/$/, "");
const API_KEY = process.env.QC_API_KEY || process.env.ADMIN_API_KEY || "";
const FIX = process.argv.includes("--fix");

async function api(endpoint, opts = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, ...(opts.headers || {}) },
  });
  return res.json().catch(() => null);
}

(async () => {
  if (!API_URL) { console.error("ตั้ง QC_API_URL ใน .env ก่อน"); process.exit(1); }
  const jobs = await api("/api/scraper/job");
  const list = Array.isArray(jobs) ? jobs : jobs?.jobs || [];
  const now = Date.now();
  const stuck = list.filter((j) => {
    if (j.status !== "running") return false;
    const upd = new Date(j.updated_at || j.started_at || j.created_at).getTime();
    return now - upd > 3 * 60000; // ไม่มีความคืบหน้าเกิน 3 นาที = worker ตายแล้ว
  });
  const blocked = list.filter((j) => j.status === "blocked_auth");
  console.log(`jobs ทั้งหมด: ${list.length} · running ค้าง (>3 นาที): ${stuck.length} · blocked_auth เดิม: ${blocked.length}`);
  for (const j of stuck) {
    console.log(`  - ${j.id} · ${String(j.date_from).slice(0, 10)} · target=${j.total_chats} processed=${j.counters?.processed_chats ?? 0} · updated=${j.updated_at}`);
    if (FIX) {
      const r = await api("/api/scraper/poll", {
        method: "PATCH",
        body: JSON.stringify({
          id: j.id,
          status: "blocked_auth",
          error_code: "LINE_SESSION_EXPIRED",
          error_text: "LINE OA Session หมดอายุ กรุณา Login ใหม่",
        }),
      });
      console.log(`    → ซ่อมเป็น blocked_auth: ${r?.ok ? "✅" : "❌ " + JSON.stringify(r)}`);
    }
  }
  if (!FIX && stuck.length) console.log("\nรันซ้ำด้วย --fix เพื่อซ่อมจริง");
  if (!stuck.length) console.log("ไม่มี job running ค้าง");
})();

// test-scraper-worker-status.js — สถานะ worker ต้องมาจาก heartbeat จริงเท่านั้น
//   + lock กัน worker ซ้ำ + หน้า UI แสดงคำสั่งทางการเดียว
const fs = require("fs");
const path = require("path");
const { isWorkerOnline, workerPanelState, lockIsStale, WORKER_ONLINE_WINDOW_MS } = require("../lib/scraper-status");

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); };
const NOW = 1_800_000_000_000;
const secAgo = (s) => new Date(NOW - s * 1000).toISOString();

console.log("===== 1) ไม่มี heartbeat → offline =====");
ok("null → offline", isWorkerOnline(null, NOW) === false);
ok("worker null → offline", workerPanelState(null, NOW) === "offline");

console.log("\n===== 2) heartbeat < 45s → online =====");
ok("10s → online", isWorkerOnline(secAgo(10), NOW) === true);
ok("44s → online", isWorkerOnline(secAgo(44), NOW) === true);

console.log("\n===== 3) heartbeat stale → offline =====");
ok("46s → offline", isWorkerOnline(secAgo(46), NOW) === false);
ok("1 ชม. → offline", isWorkerOnline(secAgo(3600), NOW) === false);

console.log("\n===== 3.5) *ห้ามอนุมาน online จาก job ใน DB* =====");
{
  // มี job active (current_job_id ตั้งอยู่) แต่ heartbeat เก่า → ต้อง offline เท่านั้น
  const w = { current_job_id: "job-123", status: "busy", last_heartbeat_at: secAgo(300) };
  ok("job ค้างใน DB + heartbeat ตาย → offline (ไม่ใช่ busy)", workerPanelState(w, NOW) === "offline");
}

console.log("\n===== 4) worker busy → แสดง job ปัจจุบัน =====");
{
  const w = { current_job_id: "job-1", status: "busy", last_heartbeat_at: secAgo(5) };
  ok("busy state", workerPanelState(w, NOW) === "busy");
}

console.log("\n===== 5) session expired → สถานะ + คำแนะนำกู้คืน =====");
{
  const w = { status: "online", line_session_status: "expired", last_heartbeat_at: secAgo(5) };
  ok("session_expired state", workerPanelState(w, NOW) === "session_expired");
  const page = fs.readFileSync(path.join(__dirname, "../app/scraper/page.js"), "utf8");
  ok("UI มีขั้นตอนกู้คืน (scraper:login)", page.includes("npm run scraper:login"));
}

console.log("\n===== 6) worker ตัวที่สอง → ถูกบล็อกด้วย lock =====");
{
  // lock ของ process ที่ยังมีชีวิต (pidAlive=true) → ไม่ stale → ตัวใหม่ต้องถูกปฏิเสธ
  const lock = { pid: 1234, last_heartbeat_at: secAgo(5), machine_name: "M" };
  ok("pid ยังอยู่ → lock ไม่ stale (บล็อกตัวใหม่)", lockIsStale(lock, { pidAlive: true, nowMs: NOW }) === false);
  const scraper = fs.readFileSync(path.join(__dirname, "../scraper.js"), "utf8");
  ok("scraper แจ้ง 'มี Scraper Worker ทำงานอยู่แล้ว'", scraper.includes("มี Scraper Worker ทำงานอยู่แล้ว"));
}

console.log("\n===== 7) lock ค้าง (stale) → กู้คืนได้ =====");
{
  ok("pid ตาย → stale", lockIsStale({ pid: 999999, last_heartbeat_at: secAgo(5) }, { pidAlive: false, nowMs: NOW }) === true);
  ok("heartbeat ใน lock เก่า 3 นาที + pid ตาย → stale", lockIsStale({ pid: 1, last_heartbeat_at: secAgo(180) }, { pidAlive: false, nowMs: NOW }) === true);
  ok("lock ว่าง/พัง → stale", lockIsStale(null, { nowMs: NOW }) === true);
}

console.log("\n===== 8-9) UI: คำสั่งทางการเดียว + dev section ซ่อน =====");
{
  const page = fs.readFileSync(path.join(__dirname, "../app/scraper/page.js"), "utf8");
  ok("แสดง scraper-live.bat --watch", page.includes("scraper-live.bat --watch"));
  ok("มีปุ่มคัดลอกคำสั่ง", page.includes("คัดลอกคำสั่ง"));
  ok("คำสั่ง dev อยู่ใน <details> (ซ่อนค่าเริ่มต้น)", /<details[\s\S]*?สำหรับผู้พัฒนาเท่านั้น[\s\S]*?scraper:watch[\s\S]*?<\/details>/.test(page));
  ok("offline state บอกคำสั่งที่ต้องเปิด", page.includes("บนเครื่อง Operator ให้เปิด"));
  ok("ไม่แนะนำ node scraper.js นอก dev section", (() => {
    const outside = page.split("<details")[0];
    return !outside.includes("node scraper.js --date");
  })());
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ผ่าน ${pass} / ล้มเหลว ${fail} (online window=${WORKER_ONLINE_WINDOW_MS / 1000}s)`);
process.exit(fail === 0 ? 0 : 1);

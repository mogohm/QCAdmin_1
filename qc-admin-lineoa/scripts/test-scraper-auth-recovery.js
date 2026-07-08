// ============================================================
// test-scraper-auth-recovery.js — state machine กู้คืน LINE session
//   ครอบ 8 สถานการณ์ตาม spec CRITICAL SCRAPER RECOVERY FIX:
//   1. ไฟล์ auth มีอยู่ แต่หน้า redirect ไป login → expired (ห้าม valid จากไฟล์)
//   2. job pending + session expired → ห้าม claim
//   3. session ตายหลัง claim (running) → blocked_auth (ไม่ done/ไม่หาย/ไม่ค้าง running)
//   4. watch mode ต้องไม่ตาย (openLineOA โยน authError ไม่ process.exit)
//   5. login กลับมา → job เดิม resume (blocked_auth → pending, ไม่สร้างใหม่)
//   6. worker ตาย → job กู้คืนได้ (blocked_auth/pending ไม่ใช่ terminal)
//   7. stderr แสดง error จริง (bat ไม่ใช้ PowerShell pipeline → ไม่มี NativeCommandError)
//   8. job active แต่ heartbeat เก่า → offline + job กู้คืนได้
//   รัน: node scripts/test-scraper-auth-recovery.js
// ============================================================
const fs = require("fs");
const path = require("path");
const {
  classifyLineSession,
  claimDecision,
  authFailTransition,
  authRestoredTransition,
  isWorkerOnline,
  workerPanelState,
} = require("../lib/scraper-status");

let pass = 0,
  fail = 0;
function t(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n== 1) ไฟล์ auth มีอยู่ แต่ถูก redirect ไป login → ต้องเป็น expired ไม่ใช่ valid ==");
{
  // มีไฟล์ storageState แต่ cookie ตาย server-side: หน้าเปิดแล้วเด้งไป /signin
  const r = classifyLineSession({ url: "https://access.line.me/oauth2/v2.1/login?x=1", hasChatList: false });
  t("redirect ไป login → valid=false", r.valid === false);
  t("status = login_required", r.status === "login_required");
  const r2 = classifyLineSession({ url: "https://chat.line.biz/U123/chat", hasChatList: false, hasLoginForm: true });
  t("เจอ form login/QR ในหน้า → login_required", r2.status === "login_required");
  // ไฟล์มีอยู่ = ไม่มีผลใด ๆ ต่อการ classify — valid ได้ทางเดียวคือเห็น chat list จริง
  const ok = classifyLineSession({ url: "https://chat.line.biz/U123/chat", hasChatList: true });
  t("เห็น chat list จริงเท่านั้น → valid", ok.valid === true && ok.status === "valid");
  const un = classifyLineSession({ url: "https://chat.line.biz/U123/chat", hasChatList: false, hasLoginForm: false });
  t("ไม่เจอทั้ง chat list และ login → unknown (ห้าม ✅)", un.status === "unknown" && un.valid === false);
}

console.log("\n== 2) job pending + session expired → ห้าม claim (pending → running ต้องไม่เกิด) ==");
{
  t("session expired → wait_auth", claimDecision("expired") === "wait_auth");
  t("session login_required → wait_auth", claimDecision("login_required") === "wait_auth");
  t("session unknown (ยังไม่ตรวจ) → wait_auth (ห้าม claim จากความไม่รู้)", claimDecision("unknown") === "wait_auth");
  t("session valid → claim", claimDecision("valid") === "claim");
}

console.log("\n== 3) session ตายหลัง claim → blocked_auth (ไม่ done / ไม่หาย / ไม่ค้าง running) ==");
{
  t("running + auth fail → blocked_auth", authFailTransition("running") === "blocked_auth");
  t("pending + auth fail → blocked_auth", authFailTransition("pending") === "blocked_auth");
  t("done ไม่ถูกแตะ", authFailTransition("done") === "done");
  t("cancelled ไม่ถูกแตะ", authFailTransition("cancelled") === "cancelled");
}

console.log("\n== 4) watch mode ต้องไม่ตายเมื่อ session หมดอายุ ==");
{
  const src = fs.readFileSync(path.join(__dirname, "..", "scraper.js"), "utf8");
  // openLineOA ต้องโยน authError (มี code) — ห้าม process.exit ใน path นี้
  const openBlock = src.slice(src.indexOf("async function openLineOA"), src.indexOf("async function scanChatList"));
  t("openLineOA ไม่มี process.exit", !/process\.exit/.test(openBlock), "ยังมี process.exit ใน openLineOA");
  t("openLineOA โยน authError", /throw authError\(/.test(openBlock));
  t("มี authWaitLoop (worker อยู่รอ ไม่ปิดตัว)", /async function authWaitLoop/.test(src));
  t("auth-wait ตรวจซ้ำทุก 15 วิ", /sleep\(15000\)/.test(src));
  t("requireSession ไม่ถูกเรียกใน watch mode (ไม่ exit ทั้ง process)", /if \(!WATCH\) requireSession\(\)/.test(src));
  t("runJob จับ LINE_SESSION_EXPIRED → blocked_auth", /code === "LINE_SESSION_EXPIRED"/.test(src) && /status: "blocked_auth"/.test(src));
  // regression (เจอจาก fault-injection จริง): openLineOA ต้องอยู่ "ใน try" ของ runJob
  // ไม่งั้น auth ตายหลัง claim จะหลุด catch → job ค้าง running แทนที่จะเป็น blocked_auth
  {
    const rj = src.slice(src.indexOf("async function runJob"), src.indexOf("async function extractNotes"));
    t("openLineOA อยู่หลัง try { ใน runJob (ตายหลัง claim ต้องลง catch)", rj.indexOf("try {") !== -1 && rj.indexOf("try {") < rj.indexOf("openLineOA(context)"));
  }
  t("preflight ก่อน claim (verifyLineSession ก่อน runJob ใน watch)", /const pre = await verifyLineSession\(context\)/.test(src));
  t("[AUTH ERROR] block ภาษาไทยพร้อมวิธีแก้", /\[AUTH ERROR\] LINE OA Session หมดอายุ/.test(src) && /npm run scraper:login/.test(src));
  // fault injection 2 โหมด: =1 fail ตั้งแต่ preflight (Scenario A) · =2 preflight ผ่านแต่ตายหลัง claim (Scenario C)
  t("FORCE_AUTH_FAIL=2 fail เฉพาะหลัง claim (openLineOA)", /\^\[12\]\$/.test(src));
  t("FORCE_AUTH_FAIL=2 ไม่กระทบ preflight (verifyLineSession เช็คเฉพาะ =1)", /SCRAPER_FORCE_AUTH_FAIL === "1"/.test(src));
}

console.log("\n== 5) login กลับมา → job เดิม resume (ไม่สร้าง job ใหม่) ==");
{
  t("blocked_auth → pending", authRestoredTransition("blocked_auth") === "pending");
  t("running ไม่ถูกแตะ", authRestoredTransition("running") === "running");
  t("done ไม่ถูกแตะ", authRestoredTransition("done") === "done");
  const src = fs.readFileSync(path.join(__dirname, "..", "scraper.js"), "utf8");
  t("มี requeueBlockedAuthJobs (patch job เดิม ไม่ createJob)", /async function requeueBlockedAuthJobs/.test(src) && !/createJob/.test(src.slice(src.indexOf("async function requeueBlockedAuthJobs"), src.indexOf("async function authWaitLoop"))));
  t("log [RECOVER]/[RESUME]/[AUTH] ครบ", /\[RECOVER\] พบ Job ที่หยุดเพราะ Session หมดอายุ/.test(src) && /\[RESUME\] ทำงาน Job เดิมต่อ job_id=/.test(src) && /\[AUTH\] LINE Session ใช้งานได้แล้ว/.test(src));
}

console.log("\n== 6) worker ตายกลางคัน → job อยู่ในสถานะกู้คืนได้ ==");
{
  // blocked_auth และ pending ไม่ใช่ terminal — startup ใหม่ requeue ได้
  const recoverable = (s) => authRestoredTransition(authFailTransition(s));
  t("running (worker ตาย auth fail) → กู้เป็น pending ได้", recoverable("running") === "pending");
  t("pending → กู้เป็น pending ได้", recoverable("pending") === "pending");
  const src = fs.readFileSync(path.join(__dirname, "..", "scraper.js"), "utf8");
  t("startup preflight + requeue ตอนเปิด worker ใหม่", /startup preflight/.test(src) && /await requeueBlockedAuthJobs\(\)/.test(src));
}

console.log("\n== 7) stderr แสดง error จริง — ไม่มี PowerShell NativeCommandError wrapper ==");
{
  const batRaw = fs.readFileSync(path.join(__dirname, "..", "scraper-live.bat"), "utf8");
  // ตรวจเฉพาะบรรทัดคำสั่งจริง (ข้าม REM comment ที่เล่าประวัติ)
  const bat = batRaw.split(/\r?\n/).filter((l) => !/^\s*REM/i.test(l)).join("\n");
  t("bat ไม่ใช้ PowerShell pipeline", !/powershell|pwsh|Tee-Object|ForEach-Object/i.test(bat), "ยังมี PowerShell ใน bat");
  t("bat เรียก node runner", /node scripts\\run-scraper-live\.js %\*/.test(bat));
  t("bat ยังตั้ง chcp 65001", /chcp 65001/.test(bat));
  const runner = fs.readFileSync(path.join(__dirname, "..", "scripts", "run-scraper-live.js"), "utf8");
  t("runner pipe stderr ตรง (ไม่ merge ผ่าน shell)", /child\.stderr\.on/.test(runner) && /process\.stderr\.write/.test(runner));
  t("runner เก็บ exit code จริง", /process\.exit\(signal \? 130 : \(code \?\? 1\)\)/.test(runner));
  t("runner เขียน log UTF-8", /encoding: "utf8"/.test(runner));
  t("runner ส่ง SIGINT ต่อให้ลูก (graceful Ctrl+C)", /child\.kill\("SIGINT"\)/.test(runner));
}

console.log("\n== 8) job active แต่ heartbeat เก่า → worker offline + job กู้คืนได้ ==");
{
  const old = new Date(Date.now() - 10 * 60000).toISOString(); // heartbeat 10 นาทีก่อน
  t("heartbeat 10 นาที → offline", isWorkerOnline(old) === false);
  const w = { last_heartbeat_at: old, status: "busy", current_job_id: "j1", line_session_status: "valid" };
  t("panel = offline แม้มี current_job_id (ห้ามอนุมานจาก job)", workerPanelState(w) === "offline");
  // job running ที่ worker ตายทิ้งไว้ → ซ่อมเป็น blocked_auth ได้ (P0-10)
  t("job running ที่ค้าง → ซ่อมเป็น blocked_auth ได้", authFailTransition("running") === "blocked_auth");
}

console.log("\n== bonus: heartbeat ส่งผล preflight จริง (P0-7) ==");
{
  const src = fs.readFileSync(path.join(__dirname, "..", "scraper.js"), "utf8");
  t("heartbeat มี line_session {status, checked_at, reason}", /line_session:/.test(src) && /checked_at: WORKER\.sessionCheckedAt/.test(src));
  t("workerHealthCheck ไม่ตั้ง valid จากไฟล์", !/existsSync\(AUTH_FILE\)[^\n]*valid/.test(src));
  const ui = fs.readFileSync(path.join(__dirname, "..", "app", "scraper", "page.js"), "utf8");
  t("UI มีสถานะ ⚠️ ยังไม่ได้ตรวจสอบจริง", /ยังไม่ได้ตรวจสอบจริง/.test(ui));
  t("UI มีปุ่มตรวจ session (P1)", /ตรวจสอบ LINE Session ตอนนี้/.test(ui) && /request_session_check/.test(ui));
  t("UI มี label blocked_auth", /blocked_auth/.test(ui));
}

console.log(`\n== สรุป: ${pass} ผ่าน / ${fail} ไม่ผ่าน ==`);
process.exit(fail ? 1 : 0);

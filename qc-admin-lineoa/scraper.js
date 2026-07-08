// scraper.js — LINE OA Manager scraper (Production) · full source (~629 lines)
//   หากดูบน GitHub raw แล้วเห็นสั้น/ว่าง = cache เก่า ให้ hard-refresh (Ctrl+Shift+R)
//   node scraper.js --watch                     poll job แล้ว scrape ต่อเนื่อง
//   node scraper.js --watch --schedule=30        + สร้าง job Yesterday อัตโนมัติทุก 30 นาที
//   node scraper.js --headed                     เปิดหน้าต่าง browser (debug)
//   node scraper.js --date=YYYY-MM-DD            scrape วันเดียว (สร้าง job เอง แล้วทำจนจบ)
//   node scraper.js --from=YYYY-MM-DD --to=YYYY-MM-DD   scrape ช่วงวันที่
//
// ENV: QC_API_URL, QC_API_KEY, LINE_OA_URL(=https://chat.line.biz), SCRAPER_HEADLESS, SCRAPER_DEBUG
// Session: .storage/line-auth.json (สร้างด้วย npm run scraper:login)
try {
  require("dotenv").config();
} catch {}
const fs = require("fs");
const path = require("path");
const core = require("./lib/scraper-core");
const D = require("./lib/scraper-date"); // Asia/Bangkok date helpers

const API_URL = (process.env.QC_API_URL || "").replace(/\/$/, "");
const API_KEY = process.env.QC_API_KEY || process.env.ADMIN_API_KEY || "";
const LINE_OA_URL = process.env.LINE_OA_URL || "https://chat.line.biz";
const AUTH_FILE = path.join(__dirname, ".storage", "line-auth.json");
const DEBUG_DIR = path.join(__dirname, ".storage", "debug");
const EVIDENCE_DIR = path.join(__dirname, ".storage", "evidence");
// โหมดเก็บภาพหลักฐานแชทจริง: flagged_only (เฉพาะเคสมีปัญหา) | all | off
const EVIDENCE_MODE = (
  process.env.EVIDENCE_CAPTURE_MODE || "flagged_only"
).toLowerCase();
const RESP_LIMIT_SEC =
  (parseInt(process.env.QC_RESPONSE_LIMIT_MINUTES || "5", 10) || 5) * 60;

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const getArg = (name) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : null;
};

const WATCH = hasFlag("--watch");
const HEADED = hasFlag("--headed");
const DRY_RUN = hasFlag("--dry-run");
const HEADLESS = HEADED
  ? false
  : !/^(0|false|no)$/i.test(process.env.SCRAPER_HEADLESS || "true");
const DEBUG = /^(1|true|yes)$/i.test(process.env.SCRAPER_DEBUG || "");
const EVIDENCE = DEBUG || DRY_RUN; // dry-run เก็บ debug evidence เสมอ
const DRY_CHATS = 3; // dry-run scrape กี่แชทแรก
const SCHEDULE_MIN = parseInt(getArg("schedule") || "0", 10);
const LIMIT = getArg("limit") ? parseInt(getArg("limit"), 10) : Infinity; // จำกัดจำนวนแชทต่อ job (ทดสอบ/ปลอดภัย)
const POLL_MS = 10000;
// โหมดการเก็บตามวันที่ (ค่าเริ่มต้น = strict — โหมด production ปกติ)
//   strict       : เปิดเฉพาะห้องที่ label ตรงวันที่เลือก, ข้ามห้องวันนี้/ใหม่กว่า, ไม่ไล่ค้น history
//   deep_history : (backfill) เปิดห้องที่ใหม่กว่าเพื่อค้นย้อนหลังได้ — ใช้ --deep-history เท่านั้น
const CLI_DATE_MODE =
  hasFlag("--deep-history") || /^deep_?history$/i.test(process.env.SCRAPER_DATE_MODE || "")
    ? "deep_history"
    : "strict";

// ---------- WORKER IDENTITY / LOCK / HEARTBEAT ----------
//   online บนหน้าเว็บมาจาก heartbeat จริงของ process นี้เท่านั้น (ห้ามอนุมานจาก job ใน DB)
const os = require("os");
const WORKER_LOCK_FILE = path.join(__dirname, ".storage", "scraper-worker.lock");
const WORKER = {
  id: `${os.hostname()}-${process.pid}`,
  machine: os.hostname(),
  mode: "idle",
  status: "online", // online | busy | draining | session_expired | error
  draining: false,
  currentJobId: null,
  currentChat: null,
  currentStep: null,
  startedAt: new Date().toISOString(),
  lastJobReceivedAt: null,
  sessionStatus: "unknown",
  health: null,
  refreshLock: null,
};

const pidAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

// lock กัน worker ซ้ำบนเครื่องเดียวกัน (npm run scraper:watch + scraper-live.bat พร้อมกัน = ห้าม)
function acquireWorkerLock(mode) {
  try {
    if (fs.existsSync(WORKER_LOCK_FILE)) {
      const lock = JSON.parse(fs.readFileSync(WORKER_LOCK_FILE, "utf8"));
      const stale =
        !lock.pid || !pidAlive(lock.pid) ||
        (lock.last_heartbeat_at && Date.now() - new Date(lock.last_heartbeat_at).getTime() > 120000);
      if (!stale) {
        console.error("\n❌ มี Scraper Worker ทำงานอยู่แล้วบนเครื่องนี้");
        console.error(`   machine=${lock.machine_name} pid=${lock.pid} mode=${lock.mode} เริ่ม ${lock.started_at}`);
        console.error("   ปิดหน้าต่างเดิมก่อน หรือรอให้จบงาน แล้วค่อยเปิดใหม่\n");
        process.exit(1);
      }
      log(`[LOCK] พบ lock ค้าง (pid ${lock.pid} ตายแล้ว) — เคลียร์แล้วเริ่มใหม่`);
    }
  } catch { /* lock อ่านไม่ได้ = stale */ }
  ensureDir(path.dirname(WORKER_LOCK_FILE));
  const writeLock = () =>
    fs.writeFileSync(WORKER_LOCK_FILE, JSON.stringify({
      machine_name: WORKER.machine, pid: process.pid, started_at: WORKER.startedAt,
      mode, last_heartbeat_at: new Date().toISOString(),
    }, null, 2));
  writeLock();
  WORKER.refreshLock = writeLock;
  const release = () => { try { fs.unlinkSync(WORKER_LOCK_FILE); } catch {} };
  process.on("exit", release);
  process.on("SIGINT", () => { release(); process.exit(0); });
  process.on("SIGTERM", () => { release(); process.exit(0); });
}

// heartbeat ทุก 12 วิ → server; server ตอบ desired_state (draining = หยุดรับงานใหม่)
function startHeartbeat(mode) {
  WORKER.mode = mode;
  const beat = async () => {
    try {
      const r = await api("/api/scraper/worker-status", {
        method: "POST",
        body: JSON.stringify({
          worker_id: WORKER.id,
          machine_name: WORKER.machine,
          pid: process.pid,
          mode: WORKER.mode,
          status: WORKER.draining ? "draining" : WORKER.status,
          current_job_id: WORKER.currentJobId,
          current_chat: WORKER.currentChat,
          current_step: WORKER.currentStep,
          line_session_status: WORKER.sessionStatus,
          health: WORKER.health,
          started_at: WORKER.startedAt,
          last_job_received_at: WORKER.lastJobReceivedAt,
          app_version: require("./package.json").version,
        }),
      });
      if (r?.desired_state === "draining" && !WORKER.draining) {
        WORKER.draining = true;
        log("[DRAIN] ได้รับคำสั่ง 'หยุดรับงานใหม่' — ทำงานปัจจุบันให้จบ แล้วไม่รับ job ใหม่");
      } else if (r?.desired_state === "running" && WORKER.draining) {
        WORKER.draining = false;
        log("[DRAIN] กลับมารับงานตามปกติ");
      }
      WORKER.refreshLock?.();
    } catch { /* heartbeat พลาดครั้งเดียวไม่เป็นไร */ }
  };
  beat();
  setInterval(beat, 12000).unref();
}

// health check ตอนเริ่ม: API / LINE session / browser / storage
async function workerHealthCheck() {
  const h = { api: false, line_session: false, browser: false, storage: false };
  try { const r = await listJobs(); h.api = Array.isArray(r); } catch {}
  h.line_session = fs.existsSync(AUTH_FILE);
  try { require("playwright"); h.browser = true; } catch {}
  try {
    const t = path.join(__dirname, ".storage", ".write-test");
    ensureDir(path.dirname(t)); fs.writeFileSync(t, "ok"); fs.unlinkSync(t);
    h.storage = true;
  } catch {}
  WORKER.health = h;
  WORKER.sessionStatus = h.line_session ? (WORKER.sessionStatus === "expired" ? "expired" : "valid") : "missing";
  return h;
}

// แบนเนอร์เริ่มงาน — CMD ต้องไม่ว่างเปล่า
function printWorkerBanner(mode, health) {
  const mark = (b) => (b ? "✅" : "❌");
  console.log(`
==================================================
  QC ADMIN LINE OA SCRAPER
==================================================
  Mode        : ${String(mode).toUpperCase()}
  Machine     : ${WORKER.machine}
  Worker ID   : ${WORKER.id}
  LINE Session: ${health.line_session ? "VALID" : "MISSING — รัน npm run scraper:login"}
  API         : ${API_URL} ${mark(health.api)}
  Browser     : ${mark(health.browser)}   Storage: ${mark(health.storage)}
==================================================
  [ENCODING]
  ภาษาไทย: ทดสอบการแสดงผลภาษาไทย
  English: OK
  Symbols: ✅ 🟢 ⚠️
==================================================`);
  // ตรวจ code page บน Windows — ถ้าไม่ใช่ 65001 (UTF-8) ภาษาไทยบนจอจะเพี้ยน
  if (process.platform === "win32") {
    try {
      const { execSync } = require("child_process");
      const cp = String(execSync("chcp", { encoding: "utf8" }));
      const m = cp.match(/(\d{3,5})/);
      if (m && m[1] !== "65001") {
        console.log(`
  ****************************************************************
  WARNING: Console UTF-8 encoding is not configured correctly.
  Active code page = ${m[1]} (expected 65001).
  Thai log text WILL be unreadable in this window.
  FIX: close this window and start via  .scraper-live.bat --watch
  (it sets "chcp 65001" automatically), or run "chcp 65001" first.
  ****************************************************************
`);
      }
    } catch { /* chcp ไม่มี (ไม่ใช่ cmd) — ข้าม */ }
  }
  if (mode === "watch") console.log("  [WAIT] รอรับ Job จากหน้าเว็บ /scraper ...\n");
}

const toISO = (d) => new Date(d).toISOString().slice(0, 10);
const log = (...a) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- API ----------
async function api(endpoint, opts = {}) {
  if (!API_URL) throw new Error("ตั้ง QC_API_URL ก่อน (ปลายทาง Next.js)");
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...(opts.headers || {}),
    },
  });
  return res.json().catch(() => ({}));
}
const pollJob = () => api("/api/scraper/poll");
const patchJob = (id, fields) =>
  api("/api/scraper/poll", {
    method: "PATCH",
    body: JSON.stringify({ id, ...fields }),
  });
const listJobs = () => api("/api/scraper/job");
const createJob = (date_from, date_to, mode = CLI_DATE_MODE) =>
  api("/api/scraper/job", {
    method: "POST",
    body: JSON.stringify({ date_from, date_to, mode }),
  });
const postLogReply = (payload) =>
  api("/api/admin/log-reply", {
    method: "POST",
    body: JSON.stringify(payload),
  });
const postEvidence = (payload) =>
  api("/api/evidence", { method: "POST", body: JSON.stringify(payload) });
const postChatBatch = (payload) =>
  api("/api/scraper/chat-batch", { method: "POST", body: JSON.stringify(payload) });

// ---------- EXACT-PAIR EVIDENCE ----------
// เวลาไทย HH:MM จาก created_at (ใช้เทียบกับเวลาบน bubble)
const bkkHHMM = (iso) => {
  if (!iso) return null;
  const t = new Date(iso);
  if (isNaN(t.getTime())) return null;
  const b = new Date(t.getTime() + 7 * 3600000);
  return `${String(b.getUTCHours()).padStart(2, "0")}:${String(b.getUTCMinutes()).padStart(2, "0")}`;
};

// หา bubble เป้าหมายใน DOM — ห้าม match ด้วย text อย่างเดียว
//   สัญญาณ: direction + normalized text + เวลา (HH:MM) + ลำดับ occurrence (ข้อความซ้ำหลายครั้ง)
//   คืน { found, confidence, matchedSignals, candidateCount, tag } — element ถูกแท็ก data-qa-ev=<tag>
async function locateMessageBubble(page, meta, tag) {
  return page.evaluate(
    ({ meta, tag }) => {
      const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const bubbles = [...document.querySelectorAll(".chat")].filter(
        (el) => el.querySelector(".chat-item-text") || /\[(sticker|image|file|media)\]/.test(el.innerText),
      );
      const items = bubbles.map((el, i) => {
        const dir = el.className.includes("chat-reverse") ? "admin" : "customer";
        const text = norm(el.querySelector(".chat-item-text")?.innerText || "");
        const times = (el.innerText.match(/\b\d{1,2}:\d{2}\b/g) || []);
        return { el, i, dir, text, time: times[times.length - 1] || null };
      });
      const target = norm(meta.text);
      // 1) direction + text
      let cands = items.filter((x) => x.dir === meta.direction && x.text === target);
      const candidateCount = cands.length;
      const signals = [];
      if (cands.length) signals.push("direction+text");
      // 2) เวลา (HH:MM ไทย)
      if (cands.length > 1 && meta.time) {
        const t = cands.filter((x) => x.time === meta.time);
        if (t.length) { cands = t; signals.push("timestamp"); }
      }
      // 3) ลำดับ occurrence ใน DOM (ข้อความ+เวลาซ้ำกันหลายใบ)
      if (cands.length > 1 && Number.isInteger(meta.occurrence)) {
        const pick = cands[Math.min(meta.occurrence, cands.length - 1)];
        if (pick) { cands = [pick]; signals.push("dom_order"); }
      }
      if (!cands.length) return { found: false, confidence: 0, matchedSignals: [], candidateCount };
      const chosen = cands[0];
      chosen.el.setAttribute("data-qa-ev", tag);
      // confidence: text+dir=60, +time=30, unique=10
      let conf = 60;
      if (signals.includes("timestamp") || (chosen.time && chosen.time === meta.time)) { conf += 30; if (!signals.includes("timestamp")) signals.push("timestamp"); }
      if (candidateCount === 1) conf += 10;
      else if (cands.length === 1) conf += 5; // แยกได้ด้วยสัญญาณเพิ่ม
      return { found: true, confidence: Math.min(100, conf), matchedSignals: signals, candidateCount, tag };
    },
    { meta, tag },
  );
}

// เลื่อนให้ "คู่ที่ตรวจ" อยู่ในจอเดียวกัน — bubble แรก ~32% จากบนจอ แล้วตรวจซ้ำว่า tag ยังอยู่
async function scrollPairIntoView(page, firstTag, lastTag) {
  const ok = await page.evaluate(
    ({ firstTag, lastTag }) => {
      const first = document.querySelector(`[data-qa-ev="${firstTag}"]`);
      if (!first) return false;
      let el = first.parentElement;
      let container = null;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if ((s.overflowY === "auto" || s.overflowY === "scroll" || s.overflowY === "overlay") && el.scrollHeight > el.clientHeight + 50) { container = el; break; }
        el = el.parentElement;
      }
      if (!container) { first.scrollIntoView({ block: "center" }); return true; }
      const cRect = container.getBoundingClientRect();
      const fRect = first.getBoundingClientRect();
      container.scrollTop += fRect.top - cRect.top - container.clientHeight * 0.32;
      return true;
    },
    { firstTag, lastTag },
  );
  await page.waitForTimeout(600); // รอ layout นิ่ง
  // ยืนยัน bubble เป้าหมายยังอยู่ (virtual list อาจ re-render)
  return ok && (await page.locator(`[data-qa-ev="${firstTag}"]`).count()) > 0;
}

// capture หลักฐาน "หลังรู้คู่ที่ตรวจแล้ว" — pair_focus / pair_context / chat_identity
//   ผูกกับ qc_score_id + message ids + source keys; ความมั่นใจต่ำ → match_status=uncertain
async function captureQcPairEvidence(page, { qcRes, convId, jobId, dateStr }) {
  if (!qcRes?.qc_score_id) return { saved: 0, verification: null };
  const caseRef = qcRes.case_ref || `QC-${String(qcRes.qc_score_id).slice(0, 6)}`;
  const dir = path.join(EVIDENCE_DIR, dateStr, String(jobId), String(convId));
  ensureDir(dir);

  // ล้าง tag เก่าทั้งหมดก่อน — tag ค้างจากคู่ก่อนหน้าใน chat เดียวกันทำให้อ่านข้อความผิด bubble
  //   (บั๊กจริงที่ post-capture verification จับได้: querySelector เจอ tag ซ้ำของคู่แรก)
  await page.evaluate(() => {
    document.querySelectorAll("[data-qa-ev]").forEach((el) => el.removeAttribute("data-qa-ev"));
  }).catch(() => {});
  // locate ทุก bubble ของคู่ — tag ไม่ซ้ำข้ามเคส (ใส่ suffix จาก qc id)
  const tagSuffix = String(qcRes.qc_score_id).replace(/-/g, "").slice(0, 8);
  const metas = [];
  (qcRes.customer_items || []).forEach((m, i) =>
    metas.push({ direction: "customer", text: m.text, time: m.time || bkkHHMM(m.created_at), occurrence: 0, tag: `qa-${tagSuffix}-c${i}` }));
  (qcRes.admin_items || []).forEach((m, i) =>
    metas.push({ direction: "admin", text: m.text, time: m.time || bkkHHMM(m.created_at), occurrence: 0, tag: `qa-${tagSuffix}-a${i}` }));
  if (!metas.length) return { saved: 0, verification: null };

  let foundCount = 0, confSum = 0;
  const signals = new Set();
  for (const m of metas) {
    const r = await locateMessageBubble(page, m, m.tag).catch(() => ({ found: false, confidence: 0 }));
    if (r.found) { foundCount++; confSum += r.confidence; (r.matchedSignals || []).forEach((s) => signals.add(s)); }
  }
  const allFound = foundCount === metas.length;
  const confidence = metas.length ? Math.round(confSum / metas.length) : 0;
  const matchStatus = allFound && confidence >= 85 ? "exact" : allFound && confidence >= 60 ? "probable" : "uncertain";
  if (!foundCount) {
    log(`[EVIDENCE] ${caseRef} — หา bubble ไม่พบเลย (ไม่ capture เป็น exact)`);
    return { saved: 0, verification: null };
  }
  const firstTag = metas[0].tag;
  const scrolled = await scrollPairIntoView(page, firstTag, metas[metas.length - 1].tag);
  if (!scrolled) log(`[EVIDENCE] ${caseRef} — scroll แล้ว tag หาย (virtual re-render)`);

  // PHASE 5: post-capture verification — อ่านข้อความ + "การมองเห็นจริงในจอ" ณ ตอนถ่าย
  //   text อยู่ใน DOM ≠ อยู่ในภาพ! bubble เป้าหมายที่อยู่นอก viewport = ไม่นับว่าถ่ายได้
  //   (พบจริง: admin bubble ที่ตรวจอยู่ใต้ fold — ภาพโชว์ bubble อื่น แต่ text hash ผ่าน)
  //   *สำคัญ*: chat list เป็น scroll container ซ้อนใน page — ต้องวัด visibility เทียบ
  //   "กรอบ container ∩ viewport" ไม่ใช่ viewport อย่างเดียว (element ที่หลุด container
  //   ยังมี rect อยู่ในช่วง window ได้ ทำให้เข้าใจผิดว่ามองเห็น ทั้งที่ถูก clip/ทับด้วยแถบพิมพ์)
  const readTags = () =>
    page.evaluate((tags) => {
      const vh = window.innerHeight;
      // กรอบที่มองเห็นจริง = container ของแชท ตัดกับ viewport
      const firstChat = document.querySelector(".chat");
      let cTop = 0, cBottom = vh;
      let el0 = firstChat && firstChat.parentElement;
      while (el0 && el0 !== document.body) {
        const s = getComputedStyle(el0);
        if ((s.overflowY === "auto" || s.overflowY === "scroll" || s.overflowY === "overlay") && el0.scrollHeight > el0.clientHeight + 50) {
          const cr = el0.getBoundingClientRect();
          cTop = Math.max(0, cr.top); cBottom = Math.min(vh, cr.bottom);
          break;
        }
        el0 = el0.parentElement;
      }
      const out = {};
      for (const t of tags) {
        const el = document.querySelector(`[data-qa-ev="${t}"]`);
        if (!el) { out[t] = { text: null, visible: false, rect: null }; continue; }
        const r = el.getBoundingClientRect();
        const visH = Math.min(r.bottom, cBottom) - Math.max(r.top, cTop);
        out[t] = {
          text: (el.querySelector(".chat-item-text")?.innerText || el.innerText || "").replace(/\s+/g, " ").trim(),
          visible: r.height > 0 && visH >= Math.min(r.height * 0.6, 80),
          rect: { top: Math.max(r.top, cTop), bottom: Math.min(r.bottom, cBottom), left: r.left, right: r.right },
        };
      }
      out.__clip = { cTop, cBottom };
      return out;
    }, metas.map((m) => m.tag)).catch(() => ({}));

  let tagInfo = await readTags();
  let clipBounds = tagInfo.__clip || { cTop: 0, cBottom: 720 };
  // Bubble ที่หลุดกรอบ → เลื่อน "ทีละใบ" เข้ากลางจอ ถ่ายภาพส่วนเพิ่ม (สูงสุด 2 ส่วน)
  const partShots = [];
  const invisibleFirst = metas.filter((m) => tagInfo[m.tag] && tagInfo[m.tag].text && !tagInfo[m.tag].visible);
  for (const invTag of invisibleFirst.slice(0, 2)) {
    await page.evaluate((tag) => {
      const el = document.querySelector(`[data-qa-ev="${tag}"]`);
      if (el) el.scrollIntoView({ block: "center" });
    }, invTag.tag).catch(() => {});
    await page.waitForTimeout(650);
    const t2 = await readTags();
    const info = t2[invTag.tag];
    if (process.env.EVIDENCE_DEBUG) log(`[EVDBG] part for ${invTag.tag}: visible=${info?.visible} rect=${JSON.stringify(info?.rect)}`);
    if (info && info.visible && info.rect) {
      const pad = 14;
      const clip = {
        x: Math.max(0, info.rect.left - pad),
        y: Math.max(0, info.rect.top - pad),
        width: Math.min(1280, info.rect.right + pad) - Math.max(0, info.rect.left - pad),
        height: Math.min(info.rect.bottom + pad, (t2.__clip?.cBottom ?? 720)) - Math.max(0, info.rect.top - pad),
      };
      if (clip.width > 30 && clip.height > 20) {
        const buf = await page.screenshot({ type: "jpeg", quality: 60, clip }).catch(() => null);
        if (buf) partShots.push({ tag: invTag.tag, buf });
      }
      // อัปเดตผล: ใบนี้ถ่ายได้จริงแล้ว (เห็นในภาพส่วนเพิ่ม)
      tagInfo[invTag.tag] = { ...tagInfo[invTag.tag], text: tagInfo[invTag.tag].text || info.text, visible: true };
    }
  }
  if (invisibleFirst.length) {
    // เลื่อนกลับ bubble แรกสำหรับภาพหลัก แล้ววัด visibility รอบสุดท้ายของใบที่เหลือ
    await page.evaluate((tag) => {
      const el = document.querySelector(`[data-qa-ev="${tag}"]`);
      if (el) el.scrollIntoView({ block: "center" });
    }, metas[0].tag).catch(() => {});
    await page.waitForTimeout(500);
    const t3 = await readTags();
    clipBounds = t3.__clip || clipBounds;
    for (const m of metas) {
      const cur = tagInfo[m.tag] || {};
      const now = t3[m.tag] || {};
      tagInfo[m.tag] = { text: cur.text || now.text, visible: !!(cur.visible || now.visible), rect: now.rect || cur.rect };
    }
  }
  // นับเฉพาะ bubble ที่ "มองเห็นจริงในภาพใดภาพหนึ่ง" — ข้อความใน DOM แต่หลุดจอ = ไม่ผ่าน
  const capturedCustomer = metas.filter((m) => /-c\d+$/.test(m.tag) && tagInfo[m.tag]?.visible).map((m) => tagInfo[m.tag].text).filter(Boolean);
  const capturedAdmin = metas.filter((m) => /-a\d+$/.test(m.tag) && tagInfo[m.tag]?.visible).map((m) => tagInfo[m.tag].text).filter(Boolean);
  const invisibleAfter = metas.filter((m) => tagInfo[m.tag] && tagInfo[m.tag].text && !tagInfo[m.tag].visible).length;
  const part2Shot = partShots.length ? partShots[0].buf : null; // ใช้ต่อใน items ด้านล่าง

  const EI = require("./lib/evidence-integrity");
  const captureManifest = {
    qc_score_id: qcRes.qc_score_id,
    case_ref: caseRef,
    conversation_id: convId,
    chat_key: qcRes.chat_key || null,
    expected_customer_message_ids: qcRes.customer_message_ids || (qcRes.customer_message_id ? [qcRes.customer_message_id] : []),
    expected_admin_message_ids: qcRes.admin_message_ids || (qcRes.admin_message_id ? [qcRes.admin_message_id] : []),
    expected_customer_text_hashes: (qcRes.customer_items || []).map((m) => EI.textHash(m.text)),
    expected_admin_text_hashes: (qcRes.admin_items || []).map((m) => EI.textHash(m.text)),
    captured_customer_texts: capturedCustomer,
    captured_admin_texts: capturedAdmin,
    captured_customer_text_hashes: capturedCustomer.map(EI.textHash),
    captured_admin_text_hashes: capturedAdmin.map(EI.textHash),
    bubbles_total: metas.length,
    bubbles_visible_in_shots: metas.length - invisibleAfter,
    multi_part: !!part2Shot,
    captured_at: new Date().toISOString(),
  };
  const verification = EI.verifyCapturedEvidence({
    expectedPair: {
      qc_score_id: qcRes.qc_score_id,
      case_ref: caseRef,
      customer_message_ids: captureManifest.expected_customer_message_ids,
      admin_message_ids: captureManifest.expected_admin_message_ids,
      customer_texts: (qcRes.customer_items || []).map((m) => m.text),
      admin_texts: (qcRes.admin_items || []).map((m) => m.text),
    },
    captureManifest,
  });
  // bubble เป้าหมายหลุดจอทุกภาพ = ไม่ผ่าน (ภาพต้อง "เห็น" ข้อความที่ตรวจจริง)
  if (invisibleAfter > 0) verification.failures.push(`bubble_not_visible(${invisibleAfter})`);
  verification.verified = verification.verified && invisibleAfter === 0;
  const verificationStatus = verification.verified ? "verified" : "failed";
  // FINAL STATUS: exact เฉพาะ verified เท่านั้น (locator conf สูงแต่ verify FAIL → uncertain)
  const finalMatchStatus = verification.verified && matchStatus === "exact" ? "exact" : verification.verified ? matchStatus : "uncertain";

  // bounding box รวมของ bubble ที่เจอ → clip สำหรับ pair_focus
  //   นับเฉพาะใบที่ "อยู่ในกรอบ container ตอนนี้จริง ๆ" และ clamp กรอบล่างที่ container
  //   (กันภาพติดแถบพิมพ์/พื้นที่นอกแชท และกัน bubble ที่หลุด container ดึงกรอบให้ผิด)
  const box = await page.evaluate(({ tags, cTop, cBottom }) => {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, n = 0;
    for (const t of tags) {
      const el = document.querySelector(`[data-qa-ev="${t}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.bottom <= cTop || r.top >= cBottom) continue; // ใบที่หลุดกรอบ → มีภาพส่วนเพิ่มของตัวเองแล้ว
      x1 = Math.min(x1, r.left); y1 = Math.min(y1, Math.max(r.top, cTop));
      x2 = Math.max(x2, r.right); y2 = Math.max(y2, Math.min(r.bottom, cBottom)); n++;
    }
    if (!n) return null;
    const vw = window.innerWidth, vh = window.innerHeight;
    const pad = 14;
    return {
      x: Math.max(0, x1 - pad), y: Math.max(cTop, y1 - pad),
      width: Math.min(vw, x2 + pad) - Math.max(0, x1 - pad),
      height: Math.min(cBottom, y2 + pad) - Math.max(cTop, y1 - pad),
      vw, vh, clippedTall: y2 - y1 > cBottom - cTop - 30,
    };
  }, { tags: metas.filter((m) => tagInfo[m.tag]?.visible).map((m) => m.tag), cTop: clipBounds.cTop, cBottom: clipBounds.cBottom });

  const items = [];
  const shoot = async (evidence_type, title, fname, clip) => {
    const buf = await page.screenshot({ type: "jpeg", quality: 60, ...(clip ? { clip } : {}) }).catch(() => null);
    if (!buf) return;
    fs.writeFileSync(path.join(dir, fname), buf);
    items.push({
      evidence_type, title,
      file_path: path.relative(__dirname, path.join(dir, fname)),
      image_base64: `data:image/jpeg;base64,${buf.toString("base64")}`,
      evidence_scope: evidence_type === "pair_focus_png" ? "exact_pair" : evidence_type === "pair_context_png" ? "pair_context" : "chat_identity",
      match_status: finalMatchStatus,
      match_confidence: confidence, // = locator confidence (แยกจาก verification)
      verification_status: verificationStatus,
      data: {
        pair: {
          customer_text: qcRes.customer_text, customer_created_at: qcRes.customer_created_at,
          admin_text: qcRes.admin_text, admin_created_at: qcRes.admin_created_at,
          response_seconds: qcRes.response_seconds,
        },
        capture_manifest: captureManifest, // ภาพ+metadata มาจาก capture ครั้งเดียวกันเสมอ
        verification, // { verified, identity_score, text_score, timestamp_score, failures }
        locator: { matched_signals: [...signals], found: foundCount, total: metas.length, locator_confidence: confidence },
      },
    });
  };
  if (process.env.EVIDENCE_DEBUG) log(`[EVDBG] box=${JSON.stringify(box)} tagInfo=${JSON.stringify(tagInfo)}`);
  // A) pair_focus — เฉพาะคู่ที่ตรวจ (clip กรอบรวมของ bubble ที่มองเห็นจริง)
  if (box && box.width > 30 && box.height > 20)
    await shoot("pair_focus_png", `คู่ข้อความที่ใช้ให้คะแนน (${caseRef})${part2Shot ? " — ส่วน 1/2" : ""}`, `${caseRef}-pair-focus.jpg`, { x: box.x, y: box.y, width: box.width, height: box.height });
  // A2) คู่สูงเกินจอ → ส่วนที่ 2 (bubble ที่เหลือ) — ภาพชุดเดียวกันครอบทุก bubble ที่ตรวจ
  if (part2Shot) {
    const fname2 = `${caseRef}-pair-focus-2.jpg`;
    fs.writeFileSync(path.join(dir, fname2), part2Shot);
    items.push({
      evidence_type: "pair_focus_png",
      title: `คู่ข้อความที่ใช้ให้คะแนน (${caseRef}) — ส่วน 2/2`,
      file_path: path.relative(__dirname, path.join(dir, fname2)),
      image_base64: `data:image/jpeg;base64,${part2Shot.toString("base64")}`,
      evidence_scope: "exact_pair",
      match_status: finalMatchStatus,
      match_confidence: confidence,
      verification_status: verificationStatus,
      data: { pair: { customer_text: qcRes.customer_text, customer_created_at: qcRes.customer_created_at, admin_text: qcRes.admin_text, admin_created_at: qcRes.admin_created_at, response_seconds: qcRes.response_seconds }, capture_manifest: captureManifest, verification, part: 2 },
    });
  }
  // B) pair_context — viewport รอบคู่ (บริบท 2-4 ข้อความ)
  await shoot("pair_context_png", `บริบทรอบคู่ข้อความ (${caseRef})`, `${caseRef}-context.jpg`);
  // C) chat_identity — แถบหัวห้อง (ชื่อลูกค้า)
  await shoot("chat_identity_png", `ตัวตนห้องแชท (${caseRef})`, `${caseRef}-identity.jpg`, { x: 0, y: 0, width: box?.vw || 1280, height: 90 });

  if (!items.length) return { saved: 0, verification, verificationStatus, matchStatus: finalMatchStatus, capturedCustomer, capturedAdmin };
  // scraper_job_id เป็น UUID — โหมด recapture ใช้ folder "recapture" แต่ห้ามส่งเข้าคอลัมน์ uuid
  const jobUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(jobId)) ? jobId : null;
  const res = await postEvidence({
    qc_score_id: qcRes.qc_score_id,
    conversation_id: convId,
    scraper_job_id: jobUuid,
    case_ref: caseRef,
    customer_message_id: qcRes.customer_message_id || null,
    admin_message_id: qcRes.admin_message_id || null,
    customer_source_keys: qcRes.customer_source_keys || null,
    admin_source_keys: qcRes.admin_source_keys || null,
    items,
  }).catch((e) => ({ error: e.message }));
  log(`[EVIDENCE] ${caseRef} · verify=${verificationStatus}${verification.failures.length ? "(" + verification.failures.join(",") + ")" : ""} match=${finalMatchStatus} locator=${confidence}% text=${verification.text_score}% found=${foundCount}/${metas.length} · saved=${res?.saved ?? 0}${res?.error ? " ⚠️ " + res.error : ""}`);
  return {
    saved: res?.saved || 0,
    verification,
    verificationStatus,
    matchStatus: finalMatchStatus,
    capturedCustomer,
    capturedAdmin,
  };
}

// แคปภาพแชทจริง (header+panel+ล่าสุด) + HTML → เก็บไฟล์ local + อัปโหลดเข้า case_evidence
async function captureEvidence(page, { convId, jobId, dateStr, panelHtml }) {
  if (!convId) return 0;
  const items = [];
  const dir = path.join(EVIDENCE_DIR, dateStr, String(jobId), String(convId));
  ensureDir(dir);
  const shoot = async (evidence_type, title, fname) => {
    const buf = await page
      .screenshot({ type: "jpeg", quality: 55 })
      .catch(() => null);
    if (!buf) return;
    fs.writeFileSync(path.join(dir, fname), buf);
    items.push({
      evidence_type,
      title,
      file_path: path.relative(__dirname, path.join(dir, fname)),
      image_base64: `data:image/jpeg;base64,${buf.toString("base64")}`,
    });
  };
  // 1) หน้าแชทปัจจุบัน (บนสุด = ต้นบทสนทนา + header + ชื่อลูกค้า)
  await shoot(
    "chat_panel_png",
    "หน้าแชทจริง (ต้นบทสนทนา)",
    "panel-current.jpg",
  );
  // 2) เลื่อนลงล่างสุด → บทสนทนาล่าสุด (ตอนถูกประเมิน)
  await page
    .evaluate(() => {
      const c = document.querySelector(".chat");
      let el = c && c.parentElement;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (
          (s.overflowY === "auto" ||
            s.overflowY === "scroll" ||
            s.overflowY === "overlay") &&
          el.scrollHeight > el.clientHeight + 50
        ) {
          el.scrollTop = el.scrollHeight;
          return;
        }
        el = el.parentElement;
      }
    })
    .catch(() => {});
  await page.waitForTimeout(500);
  await shoot("chat_part_png", "บทสนทนา (ล่าสุด)", "conversation-part-01.jpg");
  // 3) HTML snapshot
  if (panelHtml) {
    fs.writeFileSync(path.join(dir, "chat-panel.html"), panelHtml);
    items.push({
      evidence_type: "html_snapshot",
      title: "HTML หน้าแชท",
      file_path: path.relative(__dirname, path.join(dir, "chat-panel.html")),
      data: { html: panelHtml.slice(0, 20000) },
    });
  }
  if (!items.length) return 0;
  await postEvidence({
    conversation_id: convId,
    scraper_job_id: jobId,
    items,
  }).catch(() => {});
  return items.length;
}
const postNote = (line_user_id, note) =>
  api("/api/customer/note", {
    method: "POST",
    body: JSON.stringify({
      line_user_id,
      note_text: note.note_text,
      noted_at: note.noted_at,
      noted_by: note.noted_by,
    }),
  });

// ---------- debug evidence ----------
function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
async function saveScreenshot(page, name) {
  if (!EVIDENCE) return;
  try {
    ensureDir(path.join(DEBUG_DIR, "screenshots"));
    await page.screenshot({
      path: path.join(DEBUG_DIR, "screenshots", `${name}.png`),
    });
  } catch {}
}
function saveHtml(name, html) {
  if (!EVIDENCE) return;
  try {
    ensureDir(path.join(DEBUG_DIR, "html"));
    fs.writeFileSync(path.join(DEBUG_DIR, "html", `${name}.html`), html);
  } catch {}
}
function logScrape(entry) {
  if (!EVIDENCE) return;
  try {
    ensureDir(DEBUG_DIR);
    fs.appendFileSync(
      path.join(DEBUG_DIR, "scrape-log.jsonl"),
      JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n",
    );
  } catch {}
}

// ---------- session ----------
function requireSession() {
  if (!fs.existsSync(AUTH_FILE)) {
    console.error(
      "\n🔐 LINE session expired, run npm run scraper:login\n   (ไม่พบ .storage/line-auth.json)",
    );
    process.exit(2);
  }
}

// ---------- browser page helpers (reuse proven LINE OA selectors) ----------
async function openLineOA(context) {
  const page = await context.newPage();
  await page.goto(LINE_OA_URL, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  const listAppeared = await page
    .waitForSelector(".list-group-item-chat", { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  if (!listAppeared) {
    const url = page.url();
    if (/signin|login/i.test(url)) {
      console.error("\n🔐 LINE session expired, run npm run scraper:login");
      await saveScreenshot(page, "session-expired");
      process.exit(2);
    }
    throw new Error("โหลด chat list ไม่สำเร็จ (ไม่ใช่ session หมดอายุ)");
  }
  return page;
}

// scroll chat list + เก็บ chat item ที่ label อยู่ในช่วงวันที่
async function scanChatList(page, fromDate, toDate, shouldCancel, mode = "strict") {
  const seen = new Set();
  const openList = [];
  let noProgress = 0,
    lastScrollHeight = -1,
    boundaryStreak = 0,
    targetChats = 0,
    newerSkipped = 0,
    olderSeen = 0;
  const NOW = new Date();
  const from = D.normalizeJobDate(fromDate);
  const to = D.normalizeJobDate(toDate || fromDate);
  const strict = mode !== "deep_history";

  // เริ่มจากบนสุด (แชทใหม่สุด) — หา scroll container ที่เลื่อนได้จริง (delta มากสุด)
  await page.evaluate(() => {
    const items = document.querySelectorAll(".list-group-item-chat");
    if (!items.length) return;
    let el = items[0].parentElement,
      best = null,
      bestDelta = -1;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      const d = el.scrollHeight - el.clientHeight;
      if (
        d > bestDelta &&
        (s.overflowY === "auto" ||
          s.overflowY === "scroll" ||
          s.overflowY === "overlay")
      ) {
        best = el;
        bestDelta = d;
      }
      el = el.parentElement;
    }
    if (best) best.scrollTop = 0;
  });
  await sleep(600);

  for (let round = 0; round < 200; round++) {
    if (shouldCancel && (await shouldCancel())) break;
    const items = await page.$$eval(".list-group-item-chat", (els) =>
      els.map((el) => {
        const raw = el.innerText || "";
        const tokens = raw.split(/\s+/).filter(Boolean);
        const PATS = [
          /^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i,
          /^(yesterday|today)$/i,
          /^(mon|tue|wed|thu|fri|sat|sun)/i,
          /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/,
          /^(วันนี้|เมื่อวาน|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)/,
        ];
        let label = "";
        for (let i = tokens.length - 1; i >= 0; i--) {
          if (PATS.some((p) => p.test(tokens[i]))) {
            label = tokens[i];
            break;
          }
        }
        let name = (raw.split("\n")[0] || "").trim();
        for (const img of el.querySelectorAll("img[alt]")) {
          const alt = img.alt?.trim();
          if (
            alt &&
            alt.length >= 2 &&
            alt.length < 50 &&
            /[฀-๿a-zA-Z0-9]/.test(alt)
          ) {
            name = alt;
            break;
          }
        }
        return { label, name };
      }),
    );

    // นโยบายวันที่ (strict = ค่าเริ่มต้น):
    //   target  = label ตรงช่วง [from,to]  → เปิด
    //   too_new = ใหม่กว่า to / วันนี้       → strict: [SKIP] ไม่เปิด ; deep: เปิด (backfill)
    //   too_old = เก่ากว่า from             → ข้าม + นับขอบล่าง
    //   unknown = ตัดสินไม่ได้              → strict: ข้าม ; deep: เปิด
    let newThisBatch = 0;
    for (const it of items) {
      const key = `${it.name}|${it.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      newThisBatch++;
      const cls = core.classifyCandidate(it.label, from, to, NOW);
      const day = core.resolveLabelDay(it.label, NOW) || "?";
      if (cls === "too_old") {
        olderSeen++;
        continue;
      }
      if (cls === "target") {
        targetChats++;
        it.candidate_type = "target";
        openList.push(it);
        continue;
      }
      // too_new หรือ unknown
      if (strict) {
        newerSkipped++;
        const reason = cls === "unknown" ? "unresolved_label" : "current_or_newer_not_target";
        log(`[SKIP] customer=${it.name} reason=${reason} latest_activity=${day} target=${from === to ? from : from + ".." + to}`);
      } else {
        newerSkipped++; // ในโหมด deep นับไว้แต่ยังเปิด
        it.candidate_type = cls;
        openList.push(it);
      }
    }

    // ขอบล่างจริง: วันที่ "เก่าสุดที่ resolve ได้" ในรอบนี้ (ทุก item ที่มองเห็น) < fromDate
    //   หยุดเฉพาะเมื่อขอบล่างต่ำกว่า fromDate ติดกัน 2 รอบ — ไม่หยุดเพียงเพราะไม่มี candidate ใหม่
    //   (กัน virtual list ซ้อนทับกันแล้วหยุดก่อนเวลา)
    let oldestResolvedActivityDate = null;
    for (const it of items) {
      const day = core.resolveLabelDay(it.label, NOW);
      if (day && (oldestResolvedActivityDate === null || day < oldestResolvedActivityDate))
        oldestResolvedActivityDate = day;
    }
    const boundaryHit =
      oldestResolvedActivityDate !== null && oldestResolvedActivityDate < from;
    if (boundaryHit) boundaryStreak++;
    else boundaryStreak = 0;
    log(
      `[SCAN] round=${round} visible=${seen.size} new=${newThisBatch} oldest=${oldestResolvedActivityDate || "?"} target=${targetChats} newerSkipped=${newerSkipped} older=${olderSeen} boundaryStreak=${boundaryStreak}`,
    );
    if (boundaryStreak >= 2) {
      log(`[SCAN] ถึงขอบล่าง (oldest ${oldestResolvedActivityDate} < ${from}) — หยุด scroll list`);
      break;
    }

    // เลื่อนลง "ทีละหน้าจอ" (ไม่กระโดดสุด) → render ทุกช่วง ไม่ข้ามแชทกลางทางใน virtual list
    //   พอถึงล่างสุดแล้ว "นั่งค้างที่ก้น" (scrollTop=scrollHeight) → กระตุ้น LINE ให้ lazy-load หน้าถัดไป
    //   (ปลอดภัย: ทุกแชทที่โหลดแล้วอยู่ใน seen แล้ว การกระโดดก้นจึงไม่ข้ามแชทที่ยังไม่เห็น)
    const info = await page.evaluate(() => {
      const items = document.querySelectorAll(".list-group-item-chat");
      if (!items.length) return { ok: false };
      let el = items[0].parentElement,
        best = null,
        bestDelta = -1;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        const d = el.scrollHeight - el.clientHeight;
        if (
          d > bestDelta &&
          (s.overflowY === "auto" ||
            s.overflowY === "scroll" ||
            s.overflowY === "overlay")
        ) {
          best = el;
          bestDelta = d;
        }
        el = el.parentElement;
      }
      if (!best) return { ok: false };
      const before = best.scrollTop;
      const atBottom = before >= best.scrollHeight - best.clientHeight - 4;
      if (atBottom) best.scrollTop = best.scrollHeight; // ค้างก้น → โหลดหน้าถัดไป
      else best.scrollTop += Math.max(200, best.clientHeight * 0.85);
      best.dispatchEvent(new Event("scroll")); // ช่วยกระตุ้น lazy-load บาง implementation
      return { ok: true, scrollHeight: best.scrollHeight, atBottom };
    });
    await sleep(info.atBottom ? 1100 : 700); // ที่ก้นรอ lazy-load นานขึ้น

    // ความคืบหน้า: มีแชทใหม่ หรือ list ยาวขึ้น = ไล่ต่อได้; ไม่มีทั้งคู่ติดกัน 8 รอบ = สุดรายการจริง
    //   (LINE โหลดทีละหน้า ~25 ห้อง และใช้หลายรอบกว่าจะโผล่ → อดทนกว่าปกติ)
    const grew = info.ok && info.scrollHeight > lastScrollHeight;
    if (info.ok) lastScrollHeight = Math.max(lastScrollHeight, info.scrollHeight);
    if (newThisBatch > 0 || grew) noProgress = 0;
    else noProgress++;
    if (!info.ok || noProgress >= 8) {
      log(`[SCAN] สุดรายการ (ไม่มีแชทเก่ากว่าให้โหลดต่อหลังรอ ${noProgress} รอบ) — หยุดที่ ${seen.size} ห้อง`);
      break;
    }
  }
  log(
    `[SCAN] ✅ mode=${strict ? "strict" : "deep_history"} visible=${seen.size} จะเปิด=${openList.length} (target=${targetChats} newerSkipped=${newerSkipped} older=${olderSeen}) · range ${from}→${to}`,
  );
  openList.target_date_chats = targetChats;
  openList.newer_chats_skipped = newerSkipped;
  openList.older_chats_seen = olderSeen;
  return openList;
}

// เปิด chat (คลิกจากชื่อ) แล้วดึง HTML ของ chat panel + ข้อความ + notes + profile
async function scrapeChat(page, item, fromDate) {
  // คลิก chat item ที่ตรงชื่อ
  const clicked = await page
    .locator(".list-group-item-chat", { hasText: item.name })
    .first()
    .click({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!clicked) return null;
  await page.waitForTimeout(1200);

  // โหลดประวัติ: scroll ขึ้นบนสุดซ้ำ ๆ จน scrollHeight ไม่โตอีก
  //   LINE ใช้ virtual/lazy list — ข้อความ "เมื่อวาน" อยู่ด้านบน ต้อง scroll ขึ้นหลายรอบให้ lazy-load
  //   (ของเดิม scrollTop=0 ครั้งเดียวแล้ว scroll ลง → โหลดแค่ batch เดียว ไม่ถึงเมื่อวาน)
  const htmlSnaps = new Set();
  let prevH = -1,
    stable = 0;
  for (let i = 0; i < 50; i++) {
    const snap = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll(".chatsys-date, .chat"))
          .map((n) => n.outerHTML)
          .join("\n"),
      )
      .catch(() => "");
    if (snap) htmlSnaps.add(snap);
    const h = await page
      .evaluate(() => {
        const c = document.querySelector(".chat");
        let el = c && c.parentElement;
        while (el && el !== document.body) {
          const s = getComputedStyle(el);
          if (
            (s.overflowY === "auto" ||
              s.overflowY === "scroll" ||
              s.overflowY === "overlay") &&
            el.scrollHeight > el.clientHeight + 50
          ) {
            el.scrollTop = 0; // ขึ้นบนสุด → trigger โหลดประวัติเก่ากว่า
            return el.scrollHeight;
          }
          el = el.parentElement;
        }
        return -1;
      })
      .catch(() => -1);
    if (h < 0) break; // ไม่มี scroll container
    if (h === prevH) {
      if (++stable >= 3) break; // scrollHeight ไม่โตติดกัน 3 ครั้ง = โหลดประวัติครบแล้ว
    } else {
      stable = 0;
      prevH = h;
    }
    await page.waitForTimeout(650); // รอ lazy-load ประวัติ
  }
  // snapshot สุดท้าย (หลังโหลดครบ)
  const lastSnap = await page
    .evaluate(() =>
      Array.from(document.querySelectorAll(".chatsys-date, .chat"))
        .map((n) => n.outerHTML)
        .join("\n"),
    )
    .catch(() => "");
  if (lastSnap) htmlSnaps.add(lastSnap);

  const panelHtml = [...htmlSnaps].join("\n");
  saveHtml(
    `chat-${item.name}`.replace(/[^\w฀-๿-]/g, "_").slice(0, 60),
    panelHtml,
  );

  // ชื่อลูกค้า + line_user_id จาก URL + profile
  const meta = await page.evaluate(() => {
    const title = (document.title || "").replace(/\s*[|–—].*$/, "").trim();
    const url = location.href;
    const uid =
      (url.match(/\/chat\/(U[a-f0-9]{32})/) || [])[1] ||
      (url.match(/(U[a-f0-9]{32})/) || [])[1] ||
      null;
    // chat id ที่อยู่หลัง /chat/ (อาจไม่ใช่ U... — เป็น id ลูกค้าของ OA) + account id (segment แรก)
    const path = location.pathname || "";
    const chatUrlId = (path.match(/\/chat\/([^/?#]+)/) || [])[1] || null;
    const accountId =
      (path.match(/^\/?([^/]+)\/chat\//) || [])[1] ||
      path.split("/").filter(Boolean)[0] ||
      null;
    let picture = null;
    for (const img of document.querySelectorAll("img[alt]")) {
      const r = img.getBoundingClientRect();
      if (
        r.top < window.innerHeight * 0.2 &&
        r.left > window.innerWidth * 0.25 &&
        img.src
      ) {
        picture = img.src;
        break;
      }
    }
    return { title, uid, picture, chatUrlId, accountId };
  });

  // messages (ผ่าน core — dedup + แยก customer/admin) + เก็บ bubble ที่ parse fail
  const failures = [];
  const parsed = core.parseChatHTML(panelHtml, { now: new Date(), failures });
  const { unique, skipped_duplicate } = core.dedupMessages(
    parsed,
    meta.uid || item.name,
  );
  // [HISTORY] ช่วงวันของข้อความที่โหลดได้ (เวลาไทย) — ยืนยันว่าโหลดถึง fromDate
  const days = unique.map((m) => D.bangkokDayOf(m.created_at)).filter(Boolean).sort();
  if (days.length) {
    const reached = fromDate ? days[0] <= D.normalizeJobDate(fromDate) : true;
    log(`[HISTORY] ${item.name}: ${days[0]}→${days[days.length - 1]} (${unique.length} msgs)${fromDate && !reached ? " ⚠️ ยังโหลดไม่ถึง fromDate" : ""}`);
  }

  // raw HTML ของ bubble ที่ parse fail → debug/html เพื่อแก้ selector ให้ตรง ไม่เดา
  if (failures.length) {
    const fname = `parse-fail-${item.name}`
      .replace(/[^\w฀-๿-]/g, "_")
      .slice(0, 50);
    saveHtml(
      fname,
      failures
        .map((f) => `<!-- ${f.reason} (${f.direction}) -->\n${f.html}`)
        .join("\n\n"),
    );
  }

  return {
    meta,
    messages: unique,
    panelHtml,
    dupSkipped: skipped_duplicate,
    failures,
  };
}

// ---------- Job Runner ----------
async function runJob(job, context) {
  const fromDate = D.normalizeJobDate(job.date_from);
  const toDate = D.normalizeJobDate(job.date_to);
  // โหมด: job.mode (จาก DB) มาก่อน แล้วค่อย fallback เป็น CLI/env
  const mode = /^deep_?history$/i.test(job.mode || "") ? "deep_history" : CLI_DATE_MODE;
  log(`[JOB] ${job.id} · mode=${mode} · target=${fromDate}${fromDate === toDate ? "" : "→" + toDate} · today_bangkok=${D.bangkokToday()} (Asia/Bangkok)`);
  WORKER.currentJobId = job.id;
  WORKER.status = "busy";
  WORKER.currentStep = "scanning";
  WORKER.lastJobReceivedAt = new Date().toISOString();
  await patchJob(job.id, { status: "running", counters: { current_step: "scanning" } });

  let cancelled = false;
  const shouldCancel = async () => {
    const r = await patchJob(job.id, {}).catch(() => ({}));
    if (r?.cancelled) cancelled = true;
    return cancelled;
  };

  const page = await openLineOA(context);
  await saveScreenshot(page, `job-${job.id}-list`);

  // counters (นโยบายวันที่แบบ strict)
  const C = {
    mode,
    target_date_chats: 0,
    newer_chats_skipped: 0,
    older_chats_seen: 0,
    processed_chats: 0,
    collected_chats: 0,
    no_uid_chats_stored: 0,
    empty_chats: 0,
    failed_chats: 0,
    messages_found: 0,
    messages_inserted: 0,
    duplicates_skipped: 0,
    customer_messages: 0,
    admin_messages: 0,
    system_messages: 0,
    qc_pairs_created: 0,
    pending_reply_cases: 0,
    pending_reply_messages: 0,
  };
  let chatIndex = 0;
  try {
    let chats = await scanChatList(page, fromDate, toDate, shouldCancel, mode);
    C.target_date_chats = chats.target_date_chats || 0;
    C.newer_chats_skipped = chats.newer_chats_skipped || 0;
    C.older_chats_seen = chats.older_chats_seen || 0;
    if (Number.isFinite(LIMIT)) chats = chats.slice(0, LIMIT);
    log(`[SCAN] จะเปิด=${chats.length} target=${C.target_date_chats} newerSkipped=${C.newer_chats_skipped} older=${C.older_chats_seen}${Number.isFinite(LIMIT) ? ` · จำกัด ${LIMIT}` : ""} · target ${fromDate}${fromDate === toDate ? "" : "→" + toDate}`);
    if (!chats.length)
      log(`[SKIP] ไม่มีห้องที่ตรงวันที่ ${fromDate} — ข้ามห้องวันนี้/ใหม่กว่า ${C.newer_chats_skipped} ห้อง (ไม่เปิดแชท)`);
    await patchJob(job.id, { total_chats: chats.length, counters: { ...C, current_step: "opening" } });

    for (const item of chats) {
      if (await shouldCancel()) {
        log("🛑 job ถูกยกเลิก");
        break;
      }
      chatIndex++;
      C.processed_chats++;
      WORKER.currentChat = item.name;
      WORKER.currentStep = "collecting";
      await patchJob(job.id, { current_chat: item.name, counters: { ...C, current_step: "collecting" } });

      let res;
      try {
        res = await scrapeChat(page, item, fromDate);
      } catch (e) {
        C.failed_chats++;
        log(`[ERROR] [CHAT ${chatIndex}/${chats.length}] ${item.name} — scrape: ${e.message}`);
        logScrape({ chat_index: chatIndex, customer_name: item.name, skipped_reason: "scrape_error:" + e.message });
        continue;
      }
      if (!res) {
        C.failed_chats++;
        continue;
      }
      // external_chat_key คงที่ — เก็บได้แม้ไม่มี LINE user id (เก็บทุกแชท)
      //   ลำดับ: uid จริง → chat id จาก URL (ถ้าต่างจาก uid) → hash(account + ชื่อ)
      const chatIdFromUrl =
        res.meta.chatUrlId && res.meta.chatUrlId !== res.meta.uid
          ? res.meta.chatUrlId
          : null;
      const externalChatKey = core.buildExternalChatKey({
        accountId: res.meta.accountId,
        chatId: chatIdFromUrl,
        name: item.name || res.meta.title,
      });
      const lineUserId = res.meta.uid || externalChatKey;

      // FILTER: เฉพาะข้อความในช่วงวันเป้าหมาย (เวลาไทย) — กัน "วันนี้" รั่ว
      const targetMsgs = res.messages.filter((m) => D.messageInTargetRange(m.created_at, fromDate, toDate));
      log(`[CHAT ${chatIndex}/${chats.length}] ${item.name} [${item.label}]${res.meta.uid ? "" : " (no-uid→" + externalChatKey + ")"} · [FILTER] all=${res.messages.length} target=${targetMsgs.length}`);
      if (!targetMsgs.length) {
        C.empty_chats++;
        logScrape({ chat_index: chatIndex, customer_name: item.name, skipped_reason: "no target-date messages" });
        continue;
      }

      // SAVE: เก็บ "ทุกข้อความ" ก่อน (customer-only + ไม่มี uid ก็เก็บ) → chat-batch จับคู่ QC เป็นขั้นที่ 2
      const payload = {
        scraper_job_id: job.id,
        customer: {
          line_user_id: res.meta.uid || null,
          external_chat_key: externalChatKey,
          customer_name: item.name || res.meta.title,
          picture_url: res.meta.picture || null,
        },
        chat: { detected_list_label: item.label, latest_activity_date: D.normalizeJobDate(D.bangkokDayOf(targetMsgs[targetMsgs.length - 1].created_at)) },
        target: { from: fromDate, to: toDate },
        messages: targetMsgs.map((m) => ({ direction: m.direction, message_type: m.message_type || "text", text: m.message_text, created_at: m.created_at, admin_name: m.admin_name || null })),
      };
      const r = await postChatBatch(payload).catch((e) => ({ error: e.message }));
      if (!r || r.error) {
        C.failed_chats++;
        log(`[ERROR] [CHAT ${chatIndex}] chat-batch: ${r?.error || "no response"}`);
        continue;
      }
      C.collected_chats++;
      if (!res.meta.uid) C.no_uid_chats_stored++;
      C.messages_found += r.messages_found || 0;
      C.messages_inserted += r.messages_inserted || 0;
      C.duplicates_skipped += r.duplicates_skipped || 0;
      C.customer_messages += r.customer_messages || 0;
      C.admin_messages += r.admin_messages || 0;
      C.system_messages += r.system_messages || 0;
      C.qc_pairs_created += r.qc_pairs_created || 0;
      C.pending_reply_cases += r.pending_reply_cases || 0;
      C.pending_reply_messages += r.pending_reply_messages || 0;
      log(`[SAVE] inserted=${r.messages_inserted} dup=${r.duplicates_skipped} cust=${r.customer_messages} admin=${r.admin_messages} · [QC] pairs=${r.qc_pairs_created} pending(cases=${r.pending_reply_cases}/msgs=${r.pending_reply_messages})`);

      // เก็บภาพหลักฐาน "หลังรู้คู่ที่ตรวจแล้ว" — ต่อ QC case (exact pair) ไม่ใช่ viewport ทั่วไป
      //   ลำดับที่ถูกต้อง: save ทุกข้อความ → pair → runQc → รู้ qc_score_id+message ids → locate → scroll → capture
      if (EVIDENCE_MODE !== "off" && r.conversation_id && Array.isArray(r.qc_results)) {
        const toCapture = r.qc_results.filter((q) => q.qc_score_id && (EVIDENCE_MODE === "all" || q.flagged));
        for (const qcRes of toCapture) {
          await captureQcPairEvidence(page, { qcRes, convId: r.conversation_id, jobId: job.id, dateStr: toISO(fromDate) }).catch((e) => log(`[EVIDENCE] error: ${e.message}`));
        }
      }

      // notes
      if (res.meta.uid) {
        const notes = await extractNotes(page).catch(() => []);
        for (const n of notes) await postNote(res.meta.uid, n).catch(() => {});
      }
      WORKER.currentStep = "saving";
      await patchJob(job.id, { counters: { ...C, current_step: "saving" }, logged_count: C.messages_inserted });
    }

    if (cancelled) {
      await patchJob(job.id, { status: "cancelled", error_text: "ยกเลิกโดยผู้ใช้" });
    } else {
      await patchJob(job.id, { status: "done", total_chats: chats.length, counters: { ...C, current_step: "done" }, logged_count: C.messages_inserted });
      log(`[DONE] ✅ mode=${mode} opened=${C.processed_chats} target=${C.target_date_chats} newerSkipped=${C.newer_chats_skipped} older=${C.older_chats_seen} collected=${C.collected_chats} noUidStored=${C.no_uid_chats_stored} empty=${C.empty_chats} failed=${C.failed_chats} · msgs inserted=${C.messages_inserted} dup=${C.duplicates_skipped} (cust=${C.customer_messages}/admin=${C.admin_messages}) · QC pairs=${C.qc_pairs_created} pending(cases=${C.pending_reply_cases}/msgs=${C.pending_reply_messages})`);
    }
  } catch (e) {
    log(`❌ error: ${e.message}`);
    await saveScreenshot(page, `job-${job.id}-error`);
    await patchJob(job.id, {
      status: "error",
      error_text: String(e.message).slice(0, 500),
    });
  } finally {
    WORKER.currentJobId = null;
    WORKER.currentChat = null;
    WORKER.currentStep = null;
    WORKER.status = "online";
    await page.close().catch(() => {});
  }
}

// notes extraction (port จาก qc-scraper — หา block ที่จบด้วย "M/D/YYYY, HH:MM ชื่อ")
async function extractNotes(page) {
  return page
    .evaluate(() => {
      const DATE_RE =
        /^(\d{1,2}\/\d{1,2}\/\d{4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+(.+)$/;
      const out = [];
      for (const el of document.querySelectorAll("div,section,article")) {
        const r = el.getBoundingClientRect();
        if (r.left < window.innerWidth * 0.5 || r.width < 80) continue;
        const lines = (el.innerText || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length > 40 || !lines.some((l) => DATE_RE.test(l))) continue;
        if (el.querySelector("div,section,article")) continue; // leaf only
        let notedAt = null,
          notedBy = null,
          idx = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
          const m = lines[i].match(DATE_RE);
          if (m) {
            notedAt = `${m[1]}, ${m[2]}`;
            notedBy = m[3].trim();
            idx = i;
            break;
          }
        }
        const text = (idx >= 0 ? lines.slice(0, idx) : lines).join("\n").trim();
        if (text)
          out.push({ note_text: text, noted_at: notedAt, noted_by: notedBy });
      }
      return out;
    })
    .catch(() => []);
}

// ---------- DRY-RUN (validation) ----------
// scan chat list + scrape N แชทแรก, ไม่ insert DB, เก็บ evidence (screenshots/html/scrape-log.jsonl)
async function runDryRunBrowser(chromium, from, to) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await openLineOA(context);
  await saveScreenshot(page, "dryrun-list");
  log(
    `🧪 DRY-RUN ${from} → ${to} — scrape ${DRY_CHATS} แชทแรก (ไม่ insert DB)`,
  );
  const chats = (await scanChatList(page, from, to)).slice(0, DRY_CHATS);
  let idx = 0;
  for (const item of chats) {
    idx++;
    const res = await scrapeChat(page, item).catch((e) => {
      log(`  #${idx} ${item.name} — error: ${e.message}`);
      return null;
    });
    if (!res) continue;
    await saveScreenshot(page, `dryrun-chat-${idx}`);
    // กรองเฉพาะข้อความของวันที่เป้าหมาย (แชทอาจมีทั้งวันนี้+เมื่อวานใน history)
    const windowMsgs = res.messages.filter((m) =>
      core.inDateWindow(m.created_at, from, to),
    );
    const pairs = core.pairMessages(windowMsgs, { groupWindowSec: 180 });
    const notes = await extractNotes(page).catch(() => []);
    const summary = core.summarizeChat({
      chatIndex: idx,
      customerName: item.name || res.meta.title,
      dateLabel: item.label,
      messages: windowMsgs,
      pairs,
      dupSkipped: res.dupSkipped,
      notesCount: notes.length,
    });
    summary.parse_fail = res.failures.length;
    logScrape(summary);
    log(
      `  #${idx} ${summary.customer_name} [${item.label}] msgs=${summary.message_count} pairs=${summary.pairs} parse_fail=${summary.parse_fail}`,
    );
  }
  await browser.close().catch(() => {});
  log(
    `✅ dry-run เสร็จ — evidence: ${path.relative(process.cwd(), DEBUG_DIR)}/ (scrape-log.jsonl, html/, screenshots/)`,
  );
}

// dry-run แบบ offline (ไม่มี LINE session) — ใช้ fixture เพื่อให้ validation รันได้ทุกที่
async function runDryRunFixture(from, to) {
  log(
    `🧪 DRY-RUN (offline fixture) ${from} → ${to} — tests/fixtures/line-chat-sample.html (ไม่ insert DB)`,
  );
  const sample = fs.readFileSync(
    path.join(__dirname, "tests", "fixtures", "line-chat-sample.html"),
    "utf8",
  );
  const chats = [
    { name: "ลูกค้า A (fixture)", label: "Yesterday" },
    { name: "ลูกค้า B (fixture)", label: "Today" },
    { name: "ลูกค้า C (fixture)", label: "Monday" },
  ];
  let idx = 0;
  for (const c of chats.slice(0, DRY_CHATS)) {
    idx++;
    const failures = [];
    const parsed = core.parseChatHTML(sample, { now: new Date(), failures });
    const { unique, skipped_duplicate } = core.dedupMessages(
      parsed,
      "fixture_" + idx,
    );
    const pairs = core.pairMessages(unique, { groupWindowSec: 180 });
    saveHtml(
      `chat-${idx}-${c.name}`.replace(/[^\w฀-๿-]/g, "_").slice(0, 50),
      sample,
    );
    if (failures.length)
      saveHtml(
        `parse-fail-${idx}`,
        failures.map((f) => `<!-- ${f.reason} -->\n${f.html}`).join("\n\n"),
      );
    const summary = core.summarizeChat({
      chatIndex: idx,
      customerName: c.name,
      dateLabel: c.label,
      messages: unique,
      pairs,
      dupSkipped: skipped_duplicate,
      notesCount: 0,
    });
    summary.parse_fail = failures.length;
    logScrape(summary);
    log(
      `  #${idx} ${c.name} [${c.label}] msgs=${summary.message_count} (cust=${summary.customer_message_count}/admin=${summary.admin_message_count}) pairs=${summary.pairs} dup=${summary.duplicates}`,
    );
  }
  log(
    `✅ dry-run เสร็จ — evidence: ${path.relative(process.cwd(), DEBUG_DIR)}/ (scrape-log.jsonl, html/)`,
  );
}

// ---------- main ----------
async function main() {
  // DRY-RUN ก่อน requireSession (offline fixture รันได้แม้ไม่มี session)
  if (DRY_RUN) {
    const dArg = getArg("date"),
      fArg = getArg("from"),
      tArg = getArg("to");
    const from = dArg || fArg || toISO(new Date(Date.now() - 86400000));
    const to = dArg || tArg || from;
    let chromium = null;
    try {
      ({ chromium } = require("playwright"));
    } catch {}
    if (fs.existsSync(AUTH_FILE) && chromium)
      await runDryRunBrowser(chromium, from, to);
    else {
      if (!fs.existsSync(AUTH_FILE))
        log(
          "ℹ️ ไม่พบ LINE session — dry-run offline จาก fixture (production: scraper:login ก่อน)",
        );
      await runDryRunFixture(from, to);
    }
    return;
  }

  requireSession();
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    console.error(
      "\n❌ ไม่พบ playwright — รัน: npm install playwright && npx playwright install chromium",
    );
    process.exit(1);
  }

  // ---- worker mode: lock กันซ้ำ + health check + banner + heartbeat จริง ----
  const workerMode = getArg("recapture-evidence")
    ? "recapture"
    : WATCH
      ? "watch"
      : "manual";
  acquireWorkerLock(workerMode);
  const health = await workerHealthCheck();
  printWorkerBanner(workerMode, health);
  startHeartbeat(workerMode);

  const launchAndContext = async () => {
    const browser = await chromium.launch({ headless: HEADLESS });
    const context = await browser.newContext({ storageState: AUTH_FILE });
    return { browser, context };
  };

  // โหมด recapture: ซ่อมหลักฐานเคสเก่าให้ชี้คู่ข้อความเป๊ะ โดยไม่ต้อง scrape ใหม่ทั้งหมด
  //   node scraper.js --recapture-evidence=<qc_score_id> --headed
  const recapId = getArg("recapture-evidence");
  if (recapId) {
    const info = await api(`/api/scraper/recapture-info?qc_score_id=${recapId}`);
    if (!info?.ok) {
      console.error("❌ โหลดข้อมูลเคสไม่ได้:", info?.error || "no response");
      process.exit(1);
    }
    log(`[RECAPTURE] ${info.case_ref} · ลูกค้า=${info.customer_name || info.line_user_id} · score=${info.final_score}`);
    if (!info.line_user_id || !/^U[a-f0-9]{32}$/.test(info.line_user_id)) {
      console.error("❌ เคสนี้ไม่มี LINE user id จริง (external key) — เปิดห้องเดิมตรง ๆ ไม่ได้");
      process.exit(1);
    }
    const { browser, context } = await launchAndContext();
    const page = await openLineOA(context);
    // ไปห้องแชทของลูกค้าโดยตรง: /{account}/chat/{line_user_id}
    const account = (new URL(page.url()).pathname.split("/").filter(Boolean))[0] || "";
    await page.goto(`${new URL(page.url()).origin}/${account}/chat/${info.line_user_id}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(1800);
    // โหลดประวัติจนถึงวันของคู่ข้อความ (scroll ขึ้นบนสุดซ้ำ ๆ)
    const targetDay = D.bangkokDayOf(info.customer_created_at || info.admin_created_at);
    let prevH = -1, stable = 0;
    for (let i = 0; i < 60; i++) {
      const st = await page.evaluate(() => {
        const c = document.querySelector(".chat");
        let el = c && c.parentElement;
        while (el && el !== document.body) {
          const s = getComputedStyle(el);
          if ((s.overflowY === "auto" || s.overflowY === "scroll" || s.overflowY === "overlay") && el.scrollHeight > el.clientHeight + 50) {
            el.scrollTop = 0;
            return el.scrollHeight;
          }
          el = el.parentElement;
        }
        return -1;
      }).catch(() => -1);
      if (st < 0) break;
      // ถึงวันเป้าหมายหรือยัง (ดูจาก date separator บนสุดที่โหลดแล้ว)
      const oldestDay = await page.evaluate(() => {
        const d = document.querySelector(".chatsys-date");
        return d ? d.innerText.trim() : null;
      }).catch(() => null);
      const oldestIso = oldestDay ? D.normalizeJobDate(core.dayLabelToDate(oldestDay, new Date())) : null;
      if (targetDay && oldestIso && oldestIso <= targetDay) { log(`[RECAPTURE] โหลดประวัติถึง ${oldestIso} (เป้าหมาย ${targetDay})`); break; }
      if (st === prevH) { if (++stable >= 4) break; } else { stable = 0; prevH = st; }
      await page.waitForTimeout(700);
    }
    // PHASE 11: พิมพ์เป้าหมายก่อน capture — ให้ตรวจได้ว่า linkage ถูกเคสจริง
    console.log("\n===== TARGET CASE =====");
    console.log(`  qc_score_id     : ${info.qc_score_id}`);
    console.log(`  case_ref        : ${info.case_ref}`);
    console.log(`  conversation_id : ${info.conversation_id}`);
    console.log("  CUSTOMER PAIR:");
    (info.customer_items || []).forEach((m) => console.log(`    [${m.id}] "${(m.text || "").slice(0, 60)}" @ ${m.created_at}`));
    console.log("  ADMIN PAIR:");
    (info.admin_items || []).forEach((m) => console.log(`    [${m.id}] "${(m.text || "").slice(0, 60)}" @ ${m.created_at}`));

    const result = await captureQcPairEvidence(page, {
      qcRes: {
        qc_score_id: info.qc_score_id,
        case_ref: info.case_ref,
        customer_message_id: info.customer_message_id,
        admin_message_id: info.admin_message_id,
        customer_message_ids: info.customer_message_ids,
        admin_message_ids: info.admin_message_ids,
        customer_source_keys: info.customer_source_keys,
        admin_source_keys: info.admin_source_keys,
        customer_text: info.customer_text,
        admin_text: info.admin_text,
        customer_created_at: info.customer_created_at,
        admin_created_at: info.admin_created_at,
        response_seconds: info.response_seconds,
        customer_items: (info.customer_items || []).map((m) => ({ text: m.text, created_at: m.created_at, message_type: m.message_type })),
        admin_items: (info.admin_items || []).map((m) => ({ text: m.text, created_at: m.created_at, message_type: m.message_type })),
      },
      convId: info.conversation_id,
      jobId: "recapture",
      dateStr: targetDay || toISO(new Date()),
    }).catch((e) => { console.error("capture error:", e.message); return { saved: 0, verification: null }; });

    // PHASE 11: พิมพ์สิ่งที่ถ่ายได้จริง + ผล verification
    console.log("\n===== CAPTURED TEXT =====");
    console.log("  CUSTOMER:", (result.capturedCustomer || []).map((t) => `"${t.slice(0, 60)}"`).join(" | ") || "(none)");
    console.log("  ADMIN   :", (result.capturedAdmin || []).map((t) => `"${t.slice(0, 60)}"`).join(" | ") || "(none)");
    console.log("\n===== VERIFICATION =====");
    if (result.verification) {
      console.log(`  ${result.verification.verified ? "✅ PASS" : "❌ FAIL"} · identity=${result.verification.identity_score} text=${result.verification.text_score} ts=${result.verification.timestamp_score}`);
      if (result.verification.failures.length) console.log(`  failures: ${result.verification.failures.join(", ")}`);
    } else console.log("  ❌ FAIL — capture ไม่สำเร็จ");
    log(`[RECAPTURE] ${info.case_ref} — บันทึกหลักฐาน ${result.saved} รายการ (verify=${result.verificationStatus || "n/a"})`);
    await browser.close().catch(() => {});
    // exit 0 เฉพาะเมื่อ verified จริง — FAIL ไม่ถือว่า recapture สำเร็จ
    process.exit(result.saved > 0 && result.verification?.verified ? 0 : 1);
  }

  // โหมดสั่งครั้งเดียว: --yesterday / --date / --from..--to → สร้าง job แล้วทำจนจบ
  const dateArg = getArg("date");
  const fromArg = getArg("from");
  const toArg = getArg("to");
  const YESTERDAY = hasFlag("--yesterday");
  if (!WATCH && (YESTERDAY || dateArg || fromArg || toArg)) {
    const yesterday = D.bangkokYesterday();
    const from = YESTERDAY ? yesterday : dateArg || fromArg || yesterday;
    const to = YESTERDAY ? yesterday : dateArg || toArg || from;
    log(`▶️  สร้าง job ${from} → ${to}`);
    const created = await createJob(from, to);
    const job = created?.job;
    if (!job) {
      console.error("❌ สร้าง job ไม่ได้:", created?.error);
      process.exit(1);
    }
    const { browser, context } = await launchAndContext();
    await runJob(job, context);
    await browser.close().catch(() => {});
    return;
  }

  if (!WATCH) {
    console.log(
      "ใช้: node scraper.js --watch | --yesterday | --date=YYYY-MM-DD | --from=.. --to=..",
    );
    process.exit(0);
  }

  // โหมด watch: poll job + (option) สร้าง Yesterday job ตามตาราง
  log(
    `👀 watch mode (headless=${HEADLESS}, debug=${DEBUG}${SCHEDULE_MIN ? `, schedule=${SCHEDULE_MIN}m` : ""})`,
  );
  let lastSchedule = 0;
  let lastAutoDate = null;
  while (true) {
    try {
      if (SCHEDULE_MIN && Date.now() - lastSchedule > SCHEDULE_MIN * 60000) {
        lastSchedule = Date.now();
        const y = D.bangkokYesterday();
        const jobs = await listJobs().catch(() => []);
        const active =
          Array.isArray(jobs) &&
          jobs.find((j) => j.status === "pending" || j.status === "running");
        const doneToday =
          Array.isArray(jobs) &&
          jobs.find((j) => j.status === "done" && D.normalizeJobDate(j.date_from) === y);
        if (!active && !doneToday && lastAutoDate !== y) {
          // ตัวตั้งเวลา (daily) ต้องเป็น strict เสมอ — ไม่ไล่เข้า current-day chats
          await createJob(y, y, "strict");
          lastAutoDate = y;
          log(`🔄 auto-job Yesterday (${y}) · mode=strict`);
        }
      }

      // draining = ทำงานปัจจุบันให้จบแล้ว "ไม่รับ job ใหม่" (สั่งจากหน้า /scraper)
      if (WORKER.draining) {
        if (Date.now() - (WORKER._lastWaitLog || 0) > 30000) {
          log("[WAIT] โหมดหยุดรับงานใหม่ (draining) — ไม่รับ job จนกว่าจะสั่งกลับมา");
          WORKER._lastWaitLog = Date.now();
        }
      } else {
        const job = await pollJob().catch(() => null);
        if (job && job.id) {
          const { browser, context } = await launchAndContext();
          await runJob(job, context);
          await browser.close().catch(() => {});
          log("  [WAIT] รอรับ Job จากหน้าเว็บ /scraper ...");
        } else if (Date.now() - (WORKER._lastWaitLog || 0) > 30000) {
          log("[WAIT] รอรับ Job จากหน้าเว็บ /scraper ...");
          WORKER._lastWaitLog = Date.now();
        }
      }
    } catch (e) {
      log(`⚠️ watch loop error: ${e.message}`);
    }
    await sleep(POLL_MS);
  }
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});

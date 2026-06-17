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

const API_URL = (process.env.QC_API_URL || "").replace(/\/$/, "");
const API_KEY = process.env.QC_API_KEY || process.env.ADMIN_API_KEY || "";
const LINE_OA_URL = process.env.LINE_OA_URL || "https://chat.line.biz";
const AUTH_FILE = path.join(__dirname, ".storage", "line-auth.json");
const DEBUG_DIR = path.join(__dirname, ".storage", "debug");

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const getArg = (name) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : null;
};

const WATCH = hasFlag("--watch");
const HEADED = hasFlag("--headed");
const DRY_RUN = hasFlag("--dry-run");
const HEADLESS = HEADED ? false : !/^(0|false|no)$/i.test(process.env.SCRAPER_HEADLESS || "true");
const DEBUG = /^(1|true|yes)$/i.test(process.env.SCRAPER_DEBUG || "");
const EVIDENCE = DEBUG || DRY_RUN; // dry-run เก็บ debug evidence เสมอ
const DRY_CHATS = 3; // dry-run scrape กี่แชทแรก
const SCHEDULE_MIN = parseInt(getArg("schedule") || "0", 10);
const LIMIT = getArg("limit") ? parseInt(getArg("limit"), 10) : Infinity; // จำกัดจำนวนแชทต่อ job (ทดสอบ/ปลอดภัย)
const POLL_MS = 10000;

const toISO = (d) => new Date(d).toISOString().slice(0, 10);
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- API ----------
async function api(endpoint, opts = {}) {
  if (!API_URL) throw new Error("ตั้ง QC_API_URL ก่อน (ปลายทาง Next.js)");
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, ...(opts.headers || {}) },
  });
  return res.json().catch(() => ({}));
}
const pollJob = () => api("/api/scraper/poll");
const patchJob = (id, fields) => api("/api/scraper/poll", { method: "PATCH", body: JSON.stringify({ id, ...fields }) });
const listJobs = () => api("/api/scraper/job");
const createJob = (date_from, date_to) =>
  api("/api/scraper/job", { method: "POST", body: JSON.stringify({ date_from, date_to }) });
const postLogReply = (payload) => api("/api/admin/log-reply", { method: "POST", body: JSON.stringify(payload) });
const postNote = (line_user_id, note) =>
  api("/api/customer/note", {
    method: "POST",
    body: JSON.stringify({ line_user_id, note_text: note.note_text, noted_at: note.noted_at, noted_by: note.noted_by }),
  });

// ---------- debug evidence ----------
function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
async function saveScreenshot(page, name) {
  if (!EVIDENCE) return;
  try {
    ensureDir(path.join(DEBUG_DIR, "screenshots"));
    await page.screenshot({ path: path.join(DEBUG_DIR, "screenshots", `${name}.png`) });
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
    console.error("\n🔐 LINE session expired, run npm run scraper:login\n   (ไม่พบ .storage/line-auth.json)");
    process.exit(2);
  }
}

// ---------- browser page helpers (reuse proven LINE OA selectors) ----------
async function openLineOA(context) {
  const page = await context.newPage();
  await page.goto(LINE_OA_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
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
async function scanChatList(page, fromDate, toDate, shouldCancel) {
  const seen = new Set();
  const inRange = [];
  let stuck = 0,
    lastCount = -1;

  await page.evaluate(() => {
    const item = document.querySelector(".list-group-item-chat");
    let el = item && item.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (
        (s.overflowY === "auto" || s.overflowY === "scroll" || s.overflowY === "overlay") &&
        el.scrollHeight > el.clientHeight + 50
      ) {
        el.scrollTop = 0;
        return;
      }
      el = el.parentElement;
    }
  });
  await sleep(500);

  for (let round = 0; round < 80; round++) {
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
          if (alt && alt.length >= 2 && alt.length < 50 && /[฀-๿a-zA-Z0-9]/.test(alt)) {
            name = alt;
            break;
          }
        }
        return { label, name };
      }),
    );

    for (const it of items) {
      const key = `${it.name}|${it.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const r = core.labelInRange(it.label, fromDate, toDate);
      if (r === true) inRange.push(it);
    }

    // scroll ลงต่อ
    const scrolled = await page.evaluate(() => {
      const item = document.querySelector(".list-group-item-chat");
      let el = item && item.parentElement;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (
          (s.overflowY === "auto" || s.overflowY === "scroll" || s.overflowY === "overlay") &&
          el.scrollHeight > el.clientHeight + 50
        ) {
          const before = el.scrollTop;
          el.scrollTop += el.clientHeight * 0.8;
          return el.scrollTop !== before;
        }
        el = el.parentElement;
      }
      return false;
    });
    await sleep(450);
    if (seen.size === lastCount) {
      if (++stuck >= 3) break;
    } else stuck = 0;
    lastCount = seen.size;
    if (!scrolled) break;
  }
  return inRange;
}

// เปิด chat (คลิกจากชื่อ) แล้วดึง HTML ของ chat panel + ข้อความ + notes + profile
async function scrapeChat(page, item) {
  // คลิก chat item ที่ตรงชื่อ
  const clicked = await page
    .locator(".list-group-item-chat", { hasText: item.name })
    .first()
    .click({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!clicked) return null;
  await page.waitForTimeout(1200);

  // scroll chat panel ขึ้นเพื่อโหลด history แล้วเก็บ HTML สะสม (กัน virtual scroll)
  const htmlSnaps = new Set();
  await page
    .evaluate(() => {
      const c = document.querySelector(".chat");
      let el = c && c.parentElement;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (
          (s.overflowY === "auto" || s.overflowY === "scroll" || s.overflowY === "overlay") &&
          el.scrollHeight > el.clientHeight + 50
        ) {
          el.scrollTop = 0;
          return;
        }
        el = el.parentElement;
      }
    })
    .catch(() => {});
  for (let i = 0; i < 30; i++) {
    const snap = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll(".chatsys-date, .chat"))
          .map((n) => n.outerHTML)
          .join("\n"),
      )
      .catch(() => "");
    if (snap) htmlSnaps.add(snap);
    const pos = await page.evaluate(() => {
      const c = document.querySelector(".chat");
      let el = c && c.parentElement;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (
          (s.overflowY === "auto" || s.overflowY === "scroll" || s.overflowY === "overlay") &&
          el.scrollHeight > el.clientHeight + 50
        ) {
          const before = el.scrollTop;
          el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + el.clientHeight * 0.7);
          return { before, after: el.scrollTop, bottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 5 };
        }
        el = el.parentElement;
      }
      return null;
    });
    await page.waitForTimeout(400);
    if (!pos || pos.bottom || pos.after === pos.before) break;
  }

  const panelHtml = [...htmlSnaps].join("\n");
  saveHtml(`chat-${item.name}`.replace(/[^\w฀-๿-]/g, "_").slice(0, 60), panelHtml);

  // ชื่อลูกค้า + line_user_id จาก URL + profile
  const meta = await page.evaluate(() => {
    const title = (document.title || "").replace(/\s*[|–—].*$/, "").trim();
    const url = location.href;
    const uid = (url.match(/\/chat\/(U[a-f0-9]{32})/) || [])[1] || (url.match(/(U[a-f0-9]{32})/) || [])[1] || null;
    let picture = null;
    for (const img of document.querySelectorAll("img[alt]")) {
      const r = img.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.2 && r.left > window.innerWidth * 0.25 && img.src) {
        picture = img.src;
        break;
      }
    }
    return { title, uid, picture };
  });

  // messages (ผ่าน core — dedup + แยก customer/admin) + เก็บ bubble ที่ parse fail
  const failures = [];
  const parsed = core.parseChatHTML(panelHtml, { now: new Date(), failures });
  const { unique, skipped_duplicate } = core.dedupMessages(parsed, meta.uid || item.name);

  // raw HTML ของ bubble ที่ parse fail → debug/html เพื่อแก้ selector ให้ตรง ไม่เดา
  if (failures.length) {
    const fname = `parse-fail-${item.name}`.replace(/[^\w฀-๿-]/g, "_").slice(0, 50);
    saveHtml(fname, failures.map((f) => `<!-- ${f.reason} (${f.direction}) -->\n${f.html}`).join("\n\n"));
  }

  return { meta, messages: unique, panelHtml, dupSkipped: skipped_duplicate, failures };
}

// ---------- Job Runner ----------
async function runJob(job, context) {
  const fromDate = job.date_from;
  const toDate = job.date_to;
  log(`📋 Job ${job.id}: ${fromDate} → ${toDate}`);
  await patchJob(job.id, { status: "running" });

  let cancelled = false;
  const shouldCancel = async () => {
    const r = await patchJob(job.id, {}).catch(() => ({}));
    if (r?.cancelled) cancelled = true;
    return cancelled;
  };

  const page = await openLineOA(context);
  await saveScreenshot(page, `job-${job.id}-list`);

  let inserted = 0,
    skippedDup = 0,
    failed = 0,
    chatIndex = 0;
  try {
    let chats = await scanChatList(page, fromDate, toDate, shouldCancel);
    if (Number.isFinite(LIMIT)) chats = chats.slice(0, LIMIT);
    log(`🔍 พบ ${chats.length} แชทในช่วงวันที่${Number.isFinite(LIMIT) ? ` (จำกัด ${LIMIT})` : ""}`);
    await patchJob(job.id, { total_chats: chats.length });

    for (const item of chats) {
      if (await shouldCancel()) {
        log("🛑 job ถูกยกเลิก");
        break;
      }
      chatIndex++;
      await patchJob(job.id, { current_chat: item.name, logged_count: inserted });

      let res;
      try {
        res = await scrapeChat(page, item);
      } catch (e) {
        failed++;
        logScrape({ chat_index: chatIndex, customer_name: item.name, skipped_reason: "scrape_error:" + e.message });
        continue;
      }
      if (!res) {
        failed++;
        continue;
      }

      const lineUserId = res.meta.uid || `name:${item.name}`;
      const pairs = core.pairMessages(res.messages, { groupWindowSec: 180 });

      // นับฝั่ง
      const adminCount = res.messages.filter((m) => m.direction === "admin").length;
      const custCount = res.messages.filter((m) => m.direction === "customer").length;

      const sentKeys = new Set();
      for (const pair of pairs) {
        const key = core.qcPairKey({ line_user_id: lineUserId, ...pair });
        if (sentKeys.has(key)) {
          skippedDup++;
          continue;
        }
        sentKeys.add(key);
        const payload = core.buildLogReplyPayload(pair, {
          line_user_id: res.meta.uid || null,
          customer_name: res.meta.title || item.name,
          raw: { detected_date_label: item.label, message_type: pair.message_type },
        });
        payload.scraper_job_id = job.id;
        const r = await postLogReply(payload).catch((e) => ({ error: e.message }));
        if (r?.ok && !r.duplicate) inserted += r.inserted_messages || 1;
        else if (r?.duplicate) skippedDup++;
      }

      // notes
      const notes = await extractNotes(page).catch(() => []);
      let notesCount = 0;
      if (res.meta.uid) {
        for (const n of notes) {
          await postNote(res.meta.uid, n).catch(() => {});
          notesCount++;
        }
      }

      logScrape({
        chat_index: chatIndex,
        customer_name: res.meta.title || item.name,
        detected_date_label: item.label,
        message_count: res.messages.length,
        admin_message_count: adminCount,
        customer_message_count: custCount,
        notes_count: notesCount,
        pairs: pairs.length,
      });
      await patchJob(job.id, { logged_count: inserted });
    }

    if (cancelled) {
      await patchJob(job.id, { status: "cancelled", error_text: "ยกเลิกโดยผู้ใช้" });
    } else {
      await patchJob(job.id, { status: "done", total_chats: chats.length, logged_count: inserted });
      log(`✅ เสร็จ: inserted=${inserted} dup_skipped=${skippedDup} failed=${failed}`);
    }
  } catch (e) {
    log(`❌ error: ${e.message}`);
    await saveScreenshot(page, `job-${job.id}-error`);
    await patchJob(job.id, { status: "error", error_text: String(e.message).slice(0, 500) });
  } finally {
    await page.close().catch(() => {});
  }
}

// notes extraction (port จาก qc-scraper — หา block ที่จบด้วย "M/D/YYYY, HH:MM ชื่อ")
async function extractNotes(page) {
  return page
    .evaluate(() => {
      const DATE_RE = /^(\d{1,2}\/\d{1,2}\/\d{4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+(.+)$/;
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
        if (text) out.push({ note_text: text, noted_at: notedAt, noted_by: notedBy });
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
  log(`🧪 DRY-RUN ${from} → ${to} — scrape ${DRY_CHATS} แชทแรก (ไม่ insert DB)`);
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
    const pairs = core.pairMessages(res.messages, { groupWindowSec: 180 });
    const notes = await extractNotes(page).catch(() => []);
    const summary = core.summarizeChat({
      chatIndex: idx,
      customerName: res.meta.title || item.name,
      dateLabel: item.label,
      messages: res.messages,
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
  log(`🧪 DRY-RUN (offline fixture) ${from} → ${to} — tests/fixtures/line-chat-sample.html (ไม่ insert DB)`);
  const sample = fs.readFileSync(path.join(__dirname, "tests", "fixtures", "line-chat-sample.html"), "utf8");
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
    const { unique, skipped_duplicate } = core.dedupMessages(parsed, "fixture_" + idx);
    const pairs = core.pairMessages(unique, { groupWindowSec: 180 });
    saveHtml(`chat-${idx}-${c.name}`.replace(/[^\w฀-๿-]/g, "_").slice(0, 50), sample);
    if (failures.length)
      saveHtml(`parse-fail-${idx}`, failures.map((f) => `<!-- ${f.reason} -->\n${f.html}`).join("\n\n"));
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
  log(`✅ dry-run เสร็จ — evidence: ${path.relative(process.cwd(), DEBUG_DIR)}/ (scrape-log.jsonl, html/)`);
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
    if (fs.existsSync(AUTH_FILE) && chromium) await runDryRunBrowser(chromium, from, to);
    else {
      if (!fs.existsSync(AUTH_FILE))
        log("ℹ️ ไม่พบ LINE session — dry-run offline จาก fixture (production: scraper:login ก่อน)");
      await runDryRunFixture(from, to);
    }
    return;
  }

  requireSession();
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    console.error("\n❌ ไม่พบ playwright — รัน: npm install playwright && npx playwright install chromium");
    process.exit(1);
  }

  const launchAndContext = async () => {
    const browser = await chromium.launch({ headless: HEADLESS });
    const context = await browser.newContext({ storageState: AUTH_FILE });
    return { browser, context };
  };

  // โหมดสั่งครั้งเดียว: --date หรือ --from/--to → สร้าง job แล้วทำจนจบ
  const dateArg = getArg("date");
  const fromArg = getArg("from");
  const toArg = getArg("to");
  if (!WATCH && (dateArg || fromArg || toArg)) {
    const from = dateArg || fromArg || toISO(new Date(Date.now() - 86400000));
    const to = dateArg || toArg || from;
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
    console.log("ใช้: node scraper.js --watch | --date=YYYY-MM-DD | --from=.. --to=..  (ดู --help ใน README)");
    process.exit(0);
  }

  // โหมด watch: poll job + (option) สร้าง Yesterday job ตามตาราง
  log(`👀 watch mode (headless=${HEADLESS}, debug=${DEBUG}${SCHEDULE_MIN ? `, schedule=${SCHEDULE_MIN}m` : ""})`);
  let lastSchedule = 0;
  let lastAutoDate = null;
  while (true) {
    try {
      if (SCHEDULE_MIN && Date.now() - lastSchedule > SCHEDULE_MIN * 60000) {
        lastSchedule = Date.now();
        const y = toISO(new Date(Date.now() - 86400000));
        const jobs = await listJobs().catch(() => []);
        const active = Array.isArray(jobs) && jobs.find((j) => j.status === "pending" || j.status === "running");
        const doneToday = Array.isArray(jobs) && jobs.find((j) => j.status === "done" && toISO(j.date_from) === y);
        if (!active && !doneToday && lastAutoDate !== y) {
          await createJob(y, y);
          lastAutoDate = y;
          log(`🔄 auto-job Yesterday (${y})`);
        }
      }

      const job = await pollJob().catch(() => null);
      if (job && job.id) {
        const { browser, context } = await launchAndContext();
        await runJob(job, context);
        await browser.close().catch(() => {});
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

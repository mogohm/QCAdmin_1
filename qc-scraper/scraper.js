/**
 * QC Scraper — poll งานจากเว็บ → ดึงข้อความแอดมินจาก chat.line.biz → ส่ง QC API
 * รัน: node scraper.js --watch   (วนซ้ำทุก 10 วินาที)
 * รัน: node scraper.js --headed  (เห็นหน้าจอ browser)
 */
require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'auth.json');
const API_URL   = process.env.QC_API_URL?.replace(/\/$/, '');
const API_KEY   = process.env.QC_API_KEY || '';
const WATCH     = process.argv.includes('--watch');
const HEADLESS  = !process.argv.includes('--headed');
const POLL_MS   = 10000;

// ---- API helpers ----
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, ...(opts.headers || {}) },
  });
  return res.json();
}

async function pollJob() {
  return apiFetch('/api/scraper/poll');
}

async function updateJob(id, fields) {
  return apiFetch('/api/scraper/poll', {
    method: 'PATCH',
    body: JSON.stringify({ id, ...fields }),
  });
}

async function postLogReply(lineUserId, text, adminName) {
  return apiFetch('/api/admin/log-reply', {
    method: 'POST',
    body: JSON.stringify({ line_user_id: lineUserId, text, admin_name: adminName }),
  });
}

// ---- Scraper ----
async function runJob(job) {
  console.log(`\n📋 รับงาน: ${job.date_from} → ${job.date_to}`);
  await updateJob(job.id, { status: 'running' });

  if (!fs.existsSync(AUTH_FILE)) {
    await updateJob(job.id, { status: 'error', error_text: 'ไม่พบ auth.json — รัน: node login.js ก่อน' });
    return;
  }

  const dateFrom = new Date(job.date_from);
  const dateTo   = new Date(job.date_to + 'T23:59:59');

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page    = await context.newPage();

  try {
    await page.goto('https://chat.line.biz/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('signin') || page.url().includes('login')) {
      await updateJob(job.id, { status: 'error', error_text: 'Session หมดอายุ — รัน: node login.js' });
      return;
    }

    const convs = await getConversationList(page);
    console.log(`พบ ${convs.length} conversations`);
    await updateJob(job.id, { total_chats: convs.length });

    let logged = 0;
    for (let i = 0; i < convs.length; i++) {
      const { url, lineUserId, customerName } = convs[i];
      await updateJob(job.id, { current_chat: customerName || lineUserId, logged_count: logged });

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(2000);

        // ดึงเฉพาะ admin messages ในช่วงวันที่
        const messages = await extractAdminMessages(page, dateFrom, dateTo);
        if (messages.length === 0) {
          console.log(`  ข้าม ${customerName || lineUserId} (ไม่มีการตอบในช่วงนี้)`);
          continue;
        }

        console.log(`  ${customerName || lineUserId}: ${messages.length} ข้อความ`);
        for (const msg of messages) {
          const result = await postLogReply(lineUserId, msg.text, msg.adminName);
          if (result?.ok) {
            console.log(`    ✅ score ${result.qc?.finalScore ?? '—'} | "${msg.text.slice(0, 30)}"`);
            logged++;
          } else {
            console.log(`    ⚠️ ${result?.error} | "${msg.text.slice(0, 30)}"`);
          }
        }
      } catch (e) {
        console.log(`  ⚠️ ข้าม (${lineUserId}): ${e.message}`);
      }
    }

    await updateJob(job.id, { status: 'done', logged_count: logged, current_chat: null });
    console.log(`\n✅ เสร็จ — บันทึก QC ${logged} ข้อความ`);

  } catch (err) {
    await updateJob(job.id, { status: 'error', error_text: err.message });
    console.error('❌ Error:', err.message);
  } finally {
    await browser.close();
  }
}

// ดึงรายการ conversation จาก sidebar
async function getConversationList(page) {
  await page.waitForSelector('a[href*="/U"], a[href*="/C"]', { timeout: 15000 }).catch(() => {});

  return page.evaluate(() => {
    const seen = new Set();
    return Array.from(document.querySelectorAll('a[href*="/U"], a[href*="/C"]'))
      .map(a => {
        const m = a.href.match(/\/(U[a-f0-9]+|C[a-f0-9]+)/i);
        if (!m) return null;
        const lineUserId = m[1];
        if (seen.has(lineUserId)) return null;
        seen.add(lineUserId);
        const nameEl = a.querySelector('[class*="name"],[class*="Name"],strong,b');
        return { url: a.href, lineUserId, customerName: nameEl?.textContent?.trim() || lineUserId };
      })
      .filter(Boolean);
  });
}

// ดึงเฉพาะ admin messages ในช่วงวันที่ และต้องมีการตอบ (ไม่ใช่แค่ customer)
async function extractAdminMessages(page, dateFrom, dateTo) {
  return page.evaluate(({ fromMs, toMs }) => {
    const results = [];

    // หา admin bubble (ฝั่งขวา)
    const selectors = ['[class*="outgoing"]','[class*="sent"]','[class*="operator"]','[class*="Outgoing"]'];
    let bubbles = [];
    for (const sel of selectors) {
      bubbles = Array.from(document.querySelectorAll(sel));
      if (bubbles.length) break;
    }

    // fallback: bubble ที่อยู่ฝั่งขวา > 45% ของหน้าจอ
    if (!bubbles.length) {
      bubbles = Array.from(document.querySelectorAll('[class*="message"],[class*="Message"],[class*="bubble"],[class*="Bubble"]'))
        .filter(el => el.getBoundingClientRect().left > window.innerWidth * 0.45);
    }

    for (const el of bubbles) {
      // ข้อความ
      const textEl = el.querySelector('[class*="text"],[class*="Text"],p') || el;
      const text = textEl.textContent?.trim() || '';
      if (!text || text.length < 2) continue;

      // timestamp
      const timeEl = el.querySelector('time,[datetime],[class*="time"],[class*="Time"]');
      const rawTs  = timeEl?.getAttribute('datetime') || timeEl?.textContent || '';
      const ts     = rawTs ? new Date(rawTs) : null;

      // กรองตามวันที่
      if (ts && !isNaN(ts)) {
        if (ts.getTime() < fromMs || ts.getTime() > toMs) continue;
      }

      // ชื่อแอดมิน
      const agentEl = el.closest('[class*="message"],[class*="Message"]')
        ?.querySelector('[class*="sender"],[class*="Sender"],[class*="agent"],[class*="Agent"],[class*="operator"]');
      const adminName = agentEl?.textContent?.trim() || null;

      results.push({ text, timestamp: ts?.toISOString() || null, adminName });
    }

    return results;
  }, { fromMs: dateFrom.getTime(), toMs: dateTo.getTime() });
}

// ---- main loop ----
async function loop() {
  console.log(`[${new Date().toLocaleTimeString('th-TH')}] Poll job...`);
  try {
    const job = await pollJob();
    if (job?.id) {
      await runJob(job);
    } else {
      process.stdout.write('.');
    }
  } catch (e) {
    console.error('Poll error:', e.message);
  }
}

(async () => {
  if (!API_URL) { console.error('❌ ตั้งค่า QC_API_URL ใน .env ก่อน'); process.exit(1); }
  console.log(`🤖 QC Scraper พร้อมทำงาน — poll ทุก ${POLL_MS/1000}s`);
  console.log(`   API: ${API_URL}`);
  console.log(`   กด Ctrl+C เพื่อหยุด\n`);

  await loop();
  if (WATCH) setInterval(loop, POLL_MS);
})();

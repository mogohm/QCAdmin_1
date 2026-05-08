/**
 * QC Scraper — poll งานจากเว็บ → คลิก chat ทีละ chat → ดึงข้อความแอดมิน → ส่ง QC API
 */
require('dotenv').config();
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'auth.json');
const API_URL   = (process.env.QC_API_URL || '').replace(/\/$/, '');
const API_KEY   = process.env.QC_API_KEY || '';
const WATCH     = process.argv.includes('--watch');
const HEADLESS  = !process.argv.includes('--headed');
const POLL_MS   = 10000;

// ---- API helpers ----
async function apiFetch(endpoint, opts = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, ...(opts.headers || {}) },
  });
  return res.json().catch(() => ({}));
}
const pollJob    = () => apiFetch('/api/scraper/poll');
const updateJob  = (id, f) => apiFetch('/api/scraper/poll', { method: 'PATCH', body: JSON.stringify({ id, ...f }) });
const postReply  = (lineUserId, text, adminName) =>
  apiFetch('/api/admin/log-reply', { method: 'POST', body: JSON.stringify({ line_user_id: lineUserId, text, admin_name: adminName }) });

// ---- Main job runner ----
async function runJob(job) {
  console.log(`\n📋 รับงาน: ${job.date_from} → ${job.date_to}`);
  await updateJob(job.id, { status: 'running' });

  const dateFrom = new Date(job.date_from + 'T00:00:00');
  const dateTo   = new Date(job.date_to   + 'T23:59:59');

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

    // รอ chat list โหลด — หา item แรกใน sidebar
    await page.waitForSelector('[class*="ChatListItem"],[class*="chatListItem"],[class*="chat-item"],[class*="ChatItem"]', { timeout: 15000 })
      .catch(() => console.log('⚠️ ไม่พบ ChatListItem selector แบบ class, ลอง fallback...'));

    // นับ chat items ทั้งหมดในหน้าก่อน
    const totalChats = await countChatItems(page);
    console.log(`พบ ${totalChats} chats ใน sidebar`);
    await updateJob(job.id, { total_chats: totalChats });

    let logged = 0;
    for (let i = 0; i < totalChats; i++) {
      try {
        // คลิก chat item ที่ index i
        const customerName = await clickChatItem(page, i);
        await page.waitForTimeout(1500);

        // อ่าน LINE user ID จาก URL
        const url = page.url();
        const m   = url.match(/\/(U[a-f0-9]{32})/i);
        if (!m) { console.log(`  ข้าม index ${i} — URL ไม่มี user ID: ${url}`); continue; }

        const lineUserId = m[1];
        await updateJob(job.id, { current_chat: customerName || lineUserId, logged_count: logged });

        // ดึง admin messages
        const msgs = await extractAdminMessages(page, dateFrom, dateTo);
        if (msgs.length === 0) { process.stdout.write('.'); continue; }

        console.log(`\n  [${i + 1}/${totalChats}] ${customerName || lineUserId}: ${msgs.length} ข้อความแอดมิน`);
        for (const msg of msgs) {
          const r = await postReply(lineUserId, msg.text, msg.adminName);
          if (r?.ok) { console.log(`    ✅ score ${r.qc?.finalScore ?? '—'} | "${msg.text.slice(0, 40)}"`); logged++; }
          else        { console.log(`    ⚠️ ${r?.error} | "${msg.text.slice(0, 40)}"`); }
        }
      } catch (e) {
        console.log(`\n  ⚠️ index ${i}: ${e.message}`);
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

// นับ chat items ใน sidebar
async function countChatItems(page) {
  return page.evaluate(() => {
    const selectors = [
      '[class*="ChatListItem"]',
      '[class*="chatListItem"]',
      '[class*="ChatItem"]',
      '[class*="chat-item"]',
      '[class*="ConversationItem"]',
    ];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) return els.length;
    }
    // fallback: หา li ใน sidebar ที่มี avatar image
    return document.querySelectorAll('ul li:has(img), nav li:has(img)').length;
  });
}

// คลิก chat item ที่ index i แล้ว return ชื่อลูกค้า
async function clickChatItem(page, index) {
  return page.evaluate((idx) => {
    const selectors = [
      '[class*="ChatListItem"]',
      '[class*="chatListItem"]',
      '[class*="ChatItem"]',
      '[class*="chat-item"]',
      '[class*="ConversationItem"]',
    ];
    let items = [];
    for (const sel of selectors) {
      items = Array.from(document.querySelectorAll(sel));
      if (items.length > 0) break;
    }
    if (!items.length) {
      // fallback
      items = Array.from(document.querySelectorAll('ul li:has(img), nav li:has(img)'));
    }
    const el = items[idx];
    if (!el) return null;
    const nameEl = el.querySelector('[class*="name"],[class*="Name"],[class*="title"],[class*="Title"]');
    const name   = nameEl?.textContent?.trim() || null;
    el.click();
    return name;
  }, index);
}

// ดึง admin messages จาก chat ที่เปิดอยู่
async function extractAdminMessages(page, dateFrom, dateTo) {
  return page.evaluate(({ fromMs, toMs }) => {
    const results = [];

    // ลอง selector หลายแบบสำหรับ admin bubble (ฝั่งขวา)
    const selectors = [
      '[class*="outgoing"]',
      '[class*="Outgoing"]',
      '[class*="sent"]',
      '[class*="Sent"]',
      '[class*="operator"]',
      '[class*="Operator"]',
      '[class*="myMessage"]',
      '[class*="selfMessage"]',
    ];

    let bubbles = [];
    for (const sel of selectors) {
      bubbles = Array.from(document.querySelectorAll(sel));
      if (bubbles.length > 0) break;
    }

    // fallback: bubble ที่ X position > 45% width → น่าจะเป็นฝั่งขวา
    if (!bubbles.length) {
      const allBubbles = document.querySelectorAll('[class*="message"],[class*="Message"],[class*="bubble"],[class*="Bubble"],[class*="chat"],[class*="Chat"]');
      bubbles = Array.from(allBubbles).filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 50 && r.height > 20 && r.left > window.innerWidth * 0.45;
      });
    }

    for (const el of bubbles) {
      const textEl = el.querySelector('p,[class*="text"],[class*="Text"],[class*="content"],[class*="Content"]') || el;
      const text   = textEl.innerText?.trim() || '';
      if (!text || text.length < 2) continue;

      // หา timestamp
      const timeEl = el.closest('[class*="message"],[class*="Message"],[class*="item"],[class*="Item"]')
        ?.querySelector('time,[datetime],[class*="time"],[class*="Time"]');
      const rawTs  = timeEl?.getAttribute('datetime') || timeEl?.innerText || '';
      const ts     = rawTs ? new Date(rawTs) : null;

      if (ts && !isNaN(ts)) {
        if (ts.getTime() < fromMs || ts.getTime() > toMs) continue;
      }

      // ชื่อ agent
      const agentEl = el.closest('[class*="message"],[class*="Message"],[class*="item"],[class*="Item"]')
        ?.querySelector('[class*="sender"],[class*="Sender"],[class*="agent"],[class*="Agent"],[class*="operator"],[class*="staff"]');
      const adminName = agentEl?.innerText?.trim() || null;

      results.push({ text, timestamp: ts?.toISOString() || null, adminName });
    }

    return results;
  }, { fromMs: dateFrom.getTime(), toMs: dateTo.getTime() });
}

// ---- Poll loop ----
async function loop() {
  process.stdout.write(`[${new Date().toLocaleTimeString('th-TH')}] polling... `);
  try {
    const job = await pollJob();
    if (job?.id) {
      console.log(`รับงาน id=${job.id}`);
      await runJob(job);
    } else {
      process.stdout.write('ไม่มีงาน\n');
    }
  } catch (e) {
    console.error('poll error:', e.message);
  }
}

(async () => {
  if (!API_URL)                  { console.error('❌ ตั้งค่า QC_API_URL ใน .env ก่อน'); process.exit(1); }
  if (!fs.existsSync(AUTH_FILE)) { console.error('❌ ไม่พบ auth.json — รัน: node login.js ก่อน'); process.exit(1); }

  console.log(`🤖 QC Scraper พร้อม | API: ${API_URL} | mode: ${HEADLESS ? 'headless' : 'headed'}`);
  await loop();
  if (WATCH) {
    console.log(`⏰ poll ทุก ${POLL_MS / 1000}s — กด Ctrl+C เพื่อหยุด`);
    setInterval(loop, POLL_MS);
  }
})();

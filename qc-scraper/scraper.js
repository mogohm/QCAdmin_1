/**
 * QC Scraper — ดึงข้อความแอดมินจาก chat.line.biz → ส่ง QC API
 *
 * รันครั้งเดียว:  node scraper.js
 * รูปแบบ watch:  node scraper.js --watch   (วนซ้ำทุก INTERVAL_MINUTES)
 */
require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUTH_FILE  = path.join(__dirname, 'auth.json');
const STATE_FILE = path.join(__dirname, 'state.json');

const API_URL  = process.env.QC_API_URL?.replace(/\/$/, '');
const API_KEY  = process.env.QC_API_KEY || '';
const INTERVAL = parseInt(process.env.INTERVAL_MINUTES || '5') * 60 * 1000;
const WATCH    = process.argv.includes('--watch');
const HEADLESS = !process.argv.includes('--headed');

// state: { lastSeen: { [lineUserId]: isoTimestamp } }
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { lastSeen: {} }; }
}
function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

async function run() {
  if (!fs.existsSync(AUTH_FILE)) {
    console.error('❌ ไม่พบ auth.json — รัน: node login.js ก่อน');
    process.exit(1);
  }

  const state = loadState();
  console.log(`\n[${new Date().toLocaleTimeString('th-TH')}] เริ่มดึงข้อมูล...`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page    = await context.newPage();

  try {
    await page.goto('https://chat.line.biz/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000); // รอ React render

    // ตรวจว่า session ยังใช้ได้
    if (page.url().includes('signin') || page.url().includes('login')) {
      console.error('❌ Session หมดอายุ — รัน: node login.js อีกครั้ง');
      await browser.close();
      return;
    }

    // ดึงรายการ conversation ทั้งหมดจาก sidebar
    const convLinks = await getConversationList(page);
    console.log(`พบ ${convLinks.length} conversations`);

    let logged = 0;
    for (const { url, lineUserId, customerName } of convLinks) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(2000); // รอ messages โหลด

        const sinceIso = state.lastSeen[lineUserId] || null;
        const messages = await extractAdminMessages(page, sinceIso);

        if (messages.length === 0) continue;

        console.log(`  ${customerName || lineUserId}: ${messages.length} ข้อความใหม่`);

        for (const msg of messages) {
          const result = await postToQC(lineUserId, msg.text, msg.adminName);
          if (result?.ok) {
            console.log(`    ✅ "${msg.text.slice(0, 30)}" → score ${result.qc?.finalScore ?? '—'}`);
            logged++;
          } else {
            console.log(`    ⚠️ "${msg.text.slice(0, 30)}" → ${result?.error || 'error'}`);
          }
        }

        // บันทึก timestamp ล่าสุด
        const latest = messages.at(-1)?.timestamp;
        if (latest) state.lastSeen[lineUserId] = latest;
        saveState(state);

      } catch (e) {
        console.log(`  ⚠️ ข้ามไป (${lineUserId}): ${e.message}`);
      }
    }

    console.log(`✅ บันทึก QC แล้ว ${logged} ข้อความ`);

  } finally {
    await browser.close();
  }
}

// ดึงรายการ chat จาก sidebar
async function getConversationList(page) {
  // รอ sidebar โหลด
  await page.waitForSelector('[class*="conversation"], [class*="chat-item"], [class*="ChatList"]', {
    timeout: 15000,
  }).catch(() => {});

  return await page.evaluate(() => {
    const results = [];

    // LINE OA Manager ใช้ link pattern: /U..., /C..., /R...
    const links = document.querySelectorAll('a[href*="/U"], a[href*="/C"]');
    links.forEach(a => {
      const href = a.href;
      const m = href.match(/\/(U[a-f0-9]+|C[a-f0-9]+)/i);
      if (!m) return;

      const lineUserId = m[1];
      const nameEl = a.querySelector('[class*="name"], [class*="Name"], strong, b, span');
      const customerName = nameEl?.textContent?.trim() || lineUserId;

      results.push({
        url: href,
        lineUserId,
        customerName,
      });
    });

    // dedup
    const seen = new Set();
    return results.filter(r => {
      if (seen.has(r.lineUserId)) return false;
      seen.add(r.lineUserId);
      return true;
    });
  });
}

// ดึง admin messages จากหน้า chat ที่เปิดอยู่
async function extractAdminMessages(page, sinceIso) {
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : 0;

  return await page.evaluate((sinceMs) => {
    const results = [];

    // ข้อความแอดมิน = อยู่ฝั่งขวา (sent by operator)
    // LINE OA ใช้ class ที่มีคำว่า "outgoing", "sent", "operator", หรือ align right
    const selectors = [
      '[class*="outgoing"]',
      '[class*="sent"]',
      '[class*="operator"]',
      '[class*="Outgoing"]',
      '[class*="admin"]',
    ];

    let adminBubbles = [];
    for (const sel of selectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) { adminBubbles = Array.from(found); break; }
    }

    // fallback: ข้อความฝั่งขวา (justify-content: flex-end หรือ text-align: right)
    if (adminBubbles.length === 0) {
      adminBubbles = Array.from(document.querySelectorAll('[class*="message"], [class*="Message"]'))
        .filter(el => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return rect.left > window.innerWidth * 0.45; // อยู่ฝั่งขวา
        });
    }

    for (const bubble of adminBubbles) {
      // ดึง text
      const textEl = bubble.querySelector('[class*="text"], [class*="Text"], p, span');
      const text = (textEl?.textContent || bubble.textContent || '').trim();
      if (!text || text.length < 2) continue;

      // ดึง timestamp
      const timeEl = bubble.querySelector('time, [class*="time"], [class*="Time"], [datetime]');
      const tsRaw = timeEl?.getAttribute('datetime') || timeEl?.textContent || '';
      let timestamp = null;
      if (tsRaw) {
        const parsed = new Date(tsRaw);
        if (!isNaN(parsed)) timestamp = parsed.toISOString();
      }

      // กรองตาม sinceIso
      if (timestamp && new Date(timestamp).getTime() <= sinceMs) continue;

      // ดึงชื่อแอดมิน (ถ้ามี)
      const adminEl = bubble.querySelector('[class*="sender"], [class*="Sender"], [class*="agent"]');
      const adminName = adminEl?.textContent?.trim() || null;

      results.push({ text, timestamp: timestamp || new Date().toISOString(), adminName });
    }

    return results;
  }, sinceMs);
}

// ส่งไป QC API
async function postToQC(lineUserId, text, adminName) {
  try {
    const res = await fetch(`${API_URL}/api/admin/log-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ line_user_id: lineUserId, text, admin_name: adminName }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---- main ----
(async () => {
  await run();

  if (WATCH) {
    console.log(`\n⏰ รอ ${process.env.INTERVAL_MINUTES || 5} นาที แล้วดึงใหม่...`);
    setInterval(async () => {
      await run();
      console.log(`\n⏰ รอ ${process.env.INTERVAL_MINUTES || 5} นาที แล้วดึงใหม่...`);
    }, INTERVAL);
  }
})();

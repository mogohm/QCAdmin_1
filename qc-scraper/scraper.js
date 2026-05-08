require('dotenv').config();
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'auth.json');
const API_URL   = (process.env.QC_API_URL || '').replace(/\/$/, '');
const API_KEY   = process.env.QC_API_KEY  || '';
const WATCH     = process.argv.includes('--watch');
const HEADLESS  = !process.argv.includes('--headed');
const POLL_MS   = 10000;

// --schedule=30 → สร้าง job อัตโนมัติทุก 30 นาที (ใช้วันที่วันนี้)
const scheduleArg = process.argv.find(a => a.startsWith('--schedule='));
const SCHEDULE_MIN = scheduleArg ? parseInt(scheduleArg.split('=')[1]) : parseInt(process.env.SCHEDULE_MINUTES || '0');

const toISO = d => d.toISOString().slice(0, 10);
async function createAutoJob() {
  const today = toISO(new Date());
  const r = await apiFetch('/api/scraper/job', {
    method: 'POST',
    body: JSON.stringify({ date_from: today, date_to: today }),
  });
  if (r?.ok) console.log(`\n🔄 [auto-job] สร้างงาน ${today} → ${today}`);
  else console.log(`\n⚠️ [auto-job] ${r?.error || 'error'}`);
}

// ---- API helpers ----
async function apiFetch(endpoint, opts = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, ...(opts.headers||{}) },
  });
  return res.json().catch(() => ({}));
}
const pollJob   = ()       => apiFetch('/api/scraper/poll');
const updateJob = (id, f)  => apiFetch('/api/scraper/poll', { method:'PATCH', body: JSON.stringify({ id, ...f }) });
const postReply = (uid, text, adminName, customerText, adminTs, customerTs) =>
  apiFetch('/api/admin/log-reply', { method:'POST', body: JSON.stringify({
    line_user_id: uid, text, admin_name: adminName,
    customer_text: customerText || null,
    admin_ts:    adminTs    || null,
    customer_ts: customerTs || null,
  }) });

// ---- Job runner ----
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
      await updateJob(job.id, { status:'error', error_text:'Session หมดอายุ — รัน: node login.js' });
      return;
    }

    // รอ chat list
    await page.waitForSelector('.list-group-item-chat', { timeout: 15000 });
    const total = await page.locator('.list-group-item-chat').count();
    console.log(`พบ ${total} chats`);
    await updateJob(job.id, { total_chats: total });

    let logged = 0;
    for (let i = 0; i < total; i++) {
      try {
        // คลิก chat item ที่ index i
        const item = page.locator('.list-group-item-chat').nth(i);
        const nameText = await item.locator('h5, .text-truncate, strong').first().innerText().catch(() => `chat ${i+1}`);
        await item.click();

        // รอให้ URL เปลี่ยนเป็น chat URL (มี user ID)
        try { await page.waitForURL(/\/U[a-f0-9]{32}/i, { timeout: 8000 }); } catch {}
        await page.waitForTimeout(1500);

        // อ่าน LINE user ID จาก URL
        const url = page.url();
        const m   = url.match(/\/(U[a-f0-9]{32})/i);
        if (!m) { console.log(`  ข้าม ${nameText} — ไม่พบ user ID ใน URL`); continue; }
        const lineUserId = m[1];

        // ข้ามถ้า message ล่าสุดมาจากลูกค้า (แอดมินยังไม่ได้ตอบ = จุดสีเขียว)
        const lastMsgIsAdmin = await page.evaluate(() => {
          const msgs = Array.from(document.querySelectorAll('.chat')).filter(
            el => !el.className.includes('chatsys')
          );
          if (!msgs.length) return false;
          return msgs[msgs.length - 1].classList.contains('chat-reverse');
        });
        if (!lastMsgIsAdmin) { process.stdout.write('○'); continue; }

        await updateJob(job.id, { current_chat: nameText, logged_count: logged });

        // ดึง admin messages ในช่วงวันที่
        const msgs = await extractAdminMessages(page, dateFrom, dateTo);
        if (!msgs.length) { process.stdout.write('.'); continue; }

        console.log(`\n  [${i+1}/${total}] ${nameText} (${lineUserId.slice(0,8)}): ${msgs.length} ข้อความ`);
        for (const msg of msgs) {
          const r = await postReply(lineUserId, msg.text, msg.adminName, msg.customerText, msg.timestamp, msg.customerTs);
          if (r?.ok) {
            console.log(`    ✅ score ${r.qc?.finalScore ?? 'no-cust'} (${msg.adminName || 'ไม่รู้ชื่อ'}) "${msg.text.slice(0,40)}"`);
            logged++;
          } else {
            console.log(`    ⚠️ [${r?.error}] admin="${msg.adminName}" "${msg.text.slice(0,40)}"`);
          }
        }
      } catch (e) {
        console.log(`\n  ⚠️ index ${i}: ${e.message}`);
      }
    }

    await updateJob(job.id, { status:'done', logged_count: logged, current_chat: null });
    console.log(`\n✅ เสร็จ — บันทึก QC ${logged} ข้อความ`);

  } catch (err) {
    await updateJob(job.id, { status:'error', error_text: err.message });
    console.error('❌', err.message);
  } finally {
    await browser.close();
  }
}

// ดึง admin messages + customer message ก่อนหน้า ในช่วงวันที่
async function extractAdminMessages(page, dateFrom, dateTo) {
  return page.evaluate(({ fromMs, toMs }) => {
    const results = [];
    let currentDate      = null;
    let lastCustomerText = null;
    let lastCustomerTs   = null;

    function extractTs(node, currentDate) {
      const timeEl  = node.querySelector('time, [class*="chat-time"], .chat-secondary time');
      const rawTime = timeEl?.getAttribute('datetime') || timeEl?.innerText?.trim() || '';
      if (!rawTime) return null;
      const parts = rawTime.match(/(\d{1,2}):(\d{2})/);
      if (parts && currentDate) {
        const d = new Date(currentDate);
        d.setHours(parseInt(parts[1]), parseInt(parts[2]), 0, 0);
        return isNaN(d) ? null : d.toISOString();
      }
      const d = new Date(rawTime);
      return isNaN(d) ? null : d.toISOString();
    }

    const allNodes = Array.from(document.querySelectorAll('.chatsys-date, .chat'));

    for (const node of allNodes) {
      // date separator
      if (node.classList.contains('chatsys-date')) {
        const raw = node.innerText?.trim();
        if (raw) {
          const parsed = new Date(raw);
          if (!isNaN(parsed)) currentDate = parsed;
        }
        continue;
      }

      // ข้อความลูกค้า (ไม่ใช่ chat-reverse และไม่ใช่ chatsys)
      if (!node.classList.contains('chat-reverse') && !node.className.includes('chatsys')) {
        const custEl = node.querySelector('.chat-item-text.user-select-text');
        const custText = custEl?.innerText?.trim() || '';
        if (custText) {
          lastCustomerText = custText;
          lastCustomerTs   = extractTs(node, currentDate);
        }
        continue;
      }

      if (!node.classList.contains('chat-reverse')) continue;

      // ข้อความ admin
      const textEl = node.querySelector('.chat-item-text.user-select-text');
      const text   = textEl?.innerText?.trim() || '';
      if (!text || text.length < 1) continue;

      // timestamp admin
      const tsIso = extractTs(node, currentDate);
      const ts    = tsIso ? new Date(tsIso) : null;

      // กรองช่วงวันที่
      if (ts && !isNaN(ts)) {
        if (ts.getTime() < fromMs || ts.getTime() > toMs) continue;
      } else if (currentDate) {
        if (currentDate.getTime() < fromMs || currentDate.getTime() > toMs) continue;
      }

      // ชื่อแอดมินจาก .chat-content
      const contentEl = node.querySelector('.chat-content');
      let adminName   = null;
      if (contentEl) {
        const clone = contentEl.cloneNode(true);
        clone.querySelectorAll('.chat-body, .chat-main, .chat-item').forEach(e => e.remove());
        adminName = clone.innerText?.trim().split('\n')[0]?.trim() || null;
      }

      results.push({ text, adminName, timestamp: tsIso, customerText: lastCustomerText, customerTs: lastCustomerTs });
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
      console.log(`รับงาน (${job.date_from} → ${job.date_to})`);
      await runJob(job);
    } else {
      console.log('ว่าง');
    }
  } catch (e) {
    console.error('poll error:', e.message);
  }
}

(async () => {
  if (!API_URL)                  { console.error('❌ ตั้งค่า QC_API_URL ใน .env'); process.exit(1); }
  if (!fs.existsSync(AUTH_FILE)) { console.error('❌ ไม่พบ auth.json — รัน: node login.js'); process.exit(1); }

  console.log(`🤖 QC Scraper | ${API_URL} | ${HEADLESS ? 'headless' : 'headed'}${SCHEDULE_MIN ? ` | auto-job ทุก ${SCHEDULE_MIN} นาที` : ''}`);

  // ถ้าตั้ง schedule ให้สร้าง job ทันทีตอนเริ่ม และซ้ำทุก XX นาที
  if (SCHEDULE_MIN > 0) {
    await createAutoJob();
    setInterval(createAutoJob, SCHEDULE_MIN * 60 * 1000);
  }

  await loop();
  if (WATCH || SCHEDULE_MIN > 0) {
    if (WATCH) console.log(`⏰ poll ทุก ${POLL_MS/1000}s`);
    setInterval(loop, POLL_MS);
  }
})();

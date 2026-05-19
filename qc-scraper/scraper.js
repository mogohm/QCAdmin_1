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

const scheduleArg  = process.argv.find(a => a.startsWith('--schedule='));
const SCHEDULE_MIN = scheduleArg ? parseInt(scheduleArg.split('=')[1]) : parseInt(process.env.SCHEDULE_MINUTES || '0');
const MIN_IDLE_MIN = parseInt(process.env.MIN_IDLE_MINUTES || '30');

const toISO = d => d.toISOString().slice(0, 10);

function getJobDate() {
  const dateArg = process.argv.find(a => a.startsWith('--date='));
  if (dateArg) return dateArg.split('=')[1];
  if (process.argv.includes('--yesterday')) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toISO(d);
  }
  return toISO(new Date());
}

// ---- แปลง label วันใน chat list → Date ----
// LINE OA แสดง: "11:21" (วันนี้), "Yesterday", "Monday"…"Sunday", "5/13/2026"
function dayLabelToDate(label) {
  if (!label) return null;
  const s = label.trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // HH:MM → วันนี้
  if (/^\d{1,2}:\d{2}$/.test(s)) return new Date(today);

  const sl = s.toLowerCase();

  // Today / วันนี้
  if (sl === 'today' || sl === 'วันนี้') return new Date(today);

  // Yesterday / เมื่อวาน
  if (sl === 'yesterday' || sl === 'เมื่อวาน') {
    const d = new Date(today); d.setDate(d.getDate() - 1); return d;
  }

  // ชื่อวัน (ภาษาอังกฤษและไทย) — หาวันล่าสุดในอดีตที่ตรงกับวันนั้น
  const dayMap = {
    sunday: 0, sun: 0, อาทิตย์: 0,
    monday: 1, mon: 1, จันทร์: 1,
    tuesday: 2, tue: 2, อังคาร: 2,
    wednesday: 3, wed: 3, พุธ: 3,
    thursday: 4, thu: 4, พฤหัสบดี: 4, พฤหัส: 4,
    friday: 5, fri: 5, ศุกร์: 5,
    saturday: 6, sat: 6, เสาร์: 6,
  };
  for (const [name, dayNum] of Object.entries(dayMap)) {
    if (sl.includes(name)) {
      const d = new Date(today);
      let diff = (d.getDay() - dayNum + 7) % 7;
      if (diff === 0) diff = 7; // ชื่อเดียวกับวันนี้ → สัปดาห์ก่อน
      d.setDate(d.getDate() - diff);
      return d;
    }
  }

  // M/D/YYYY หรือ D/M/YYYY หรือ M/D
  const numMatch = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (numMatch) {
    const a = parseInt(numMatch[1]);
    const b = parseInt(numMatch[2]);
    const yr = numMatch[3]
      ? (parseInt(numMatch[3]) > 100 ? parseInt(numMatch[3]) : 2000 + parseInt(numMatch[3]))
      : today.getFullYear();
    // LINE OA (screenshot) ใช้ M/D/YYYY
    if (b > 12) return new Date(yr, a - 1, b); // b คือ day > 12 แน่นอน
    if (a > 12) return new Date(yr, b - 1, a); // a คือ day > 12
    return new Date(yr, a - 1, b);             // assume M/D
  }

  // Fallback: standard parse
  const d = new Date(s);
  if (!isNaN(d)) { d.setHours(0, 0, 0, 0); return d; }
  return null;
}

// ---- API helpers ----
async function apiFetch(endpoint, opts = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, ...(opts.headers || {}) },
  });
  return res.json().catch(() => ({}));
}

const pollJob   = ()      => apiFetch('/api/scraper/poll');
const updateJob = (id, f) => apiFetch('/api/scraper/poll', { method: 'PATCH', body: JSON.stringify({ id, ...f }) });

const postReply = (uid, text, adminName, customerText, adminTs, customerTs, customerName) =>
  apiFetch('/api/admin/log-reply', { method: 'POST', body: JSON.stringify({
    line_user_id: uid, text, admin_name: adminName,
    customer_text:  customerText  || null,
    admin_ts:       adminTs       || null,
    customer_ts:    customerTs    || null,
    customer_name:  customerName  || null,
  }) });

const postNote = (uid, noteText, notedAt, notedBy) =>
  apiFetch('/api/customer/note', { method: 'POST', body: JSON.stringify({
    line_user_id: uid, note_text: noteText,
    noted_at: notedAt || null,
    noted_by: notedBy || null,
  }) });

async function createAutoJob() {
  const existing = await apiFetch('/api/scraper/job');
  if (Array.isArray(existing)) {
    const active = existing.find(j => j.status === 'pending' || j.status === 'running');
    if (active) {
      console.log(`\n⏭️ [auto-job] ข้าม — มี job ${active.status} อยู่แล้ว (id=${active.id})`);
      return;
    }
  }
  const date = getJobDate();
  const r = await apiFetch('/api/scraper/job', {
    method: 'POST',
    body: JSON.stringify({ date_from: date, date_to: date }),
  });
  if (r?.ok) console.log(`\n🔄 [auto-job] สร้างงาน ${date} → ${date}`);
  else console.log(`\n⚠️ [auto-job] ${r?.error || 'error'}`);
}

// ---- Chat List: โหลดทุก item พร้อม timestamp label ----
// หยุดเร็วเมื่อ item เก่ากว่า dateFrom เพื่อไม่โหลดเกิน
async function loadChatListWithDates(page, dateFrom) {
  const fromMs  = dateFrom.getTime();
  let   prev    = 0;
  let   tooOld  = false;

  for (let t = 0; t < 100 && !tooOld; t++) {
    // Scroll chat list ลงเพื่อโหลด virtual scroll items เพิ่ม
    const scrolled = await page.evaluate(() => {
      const item = document.querySelector('.list-group-item-chat');
      if (!item) return false;
      let el = item.parentElement;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'overlay') &&
            el.scrollHeight > el.clientHeight + 50) {
          const before = el.scrollTop;
          el.scrollTop = el.scrollHeight;
          return el.scrollTop !== before;
        }
        el = el.parentElement;
      }
      return false;
    });
    await page.waitForTimeout(400);

    const n = await page.locator('.list-group-item-chat').count();
    if (n === prev && !scrolled) break;
    prev = n;

    // ตรวจ label ของ item สุดท้ายที่โหลดมา
    const lastLabel = await page.evaluate(() => {
      const items = document.querySelectorAll('.list-group-item-chat');
      if (!items.length) return null;
      const last = items[items.length - 1];
      const timeEl = last.querySelector('[class*="time"], time');
      return timeEl?.innerText?.trim() || timeEl?.getAttribute('datetime') || null;
    });
    if (lastLabel) {
      const d = dayLabelToDate(lastLabel);
      if (d && d.getTime() < fromMs) { tooOld = true; }
    }
  }

  // เก็บ timestamp labels ทุก item ก่อน scroll กลับบน
  const itemLabels = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.list-group-item-chat')).map((item, i) => {
      const timeEl = item.querySelector('[class*="time"], time, [class*="date"]');
      return timeEl?.innerText?.trim() || timeEl?.getAttribute('datetime') || '';
    });
  });

  // Scroll กลับบนสุด
  await page.evaluate(() => {
    const item = document.querySelector('.list-group-item-chat');
    if (!item) return;
    let el = item.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'overlay') &&
          el.scrollHeight > el.clientHeight + 50) {
        el.scrollTop = 0; return;
      }
      el = el.parentElement;
    }
  });
  await page.waitForTimeout(500);

  const total = await page.locator('.list-group-item-chat').count();
  console.log(`  📋 โหลด chat list: ${total} chats`);
  return { total, itemLabels };
}

// ---- ดึงชื่อลูกค้าจาก right panel (Box 2) ----
async function extractCustomerNameFromPanel(page) {
  return page.evaluate(() => {
    // 1. Right panel: header ของ sidebar ขวา
    //    LINE OA มักใช้ class ที่มี "profile", "contact", "customer"
    const rightSelectors = [
      '[class*="chat-profile"] [class*="name"]:not([class*="time"])',
      '[class*="contact-info"] [class*="name"]',
      '[class*="customer-profile"] h4',
      '[class*="customer-profile"] strong',
      '[class*="profile-name"]',
      '[class*="contact-name"]',
      '[class*="user-name"]',
    ];
    for (const sel of rightSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const t = el.innerText?.trim();
          if (t && t.length > 0 && t.length < 100 && !/^\d{1,2}:\d{2}$/.test(t)) return t;
        }
      } catch {}
    }

    // 2. หา element ที่อยู่ฝั่งขวา (>60% ของ screen width) — เป็น h4 หรือ strong
    const candidates = Array.from(document.querySelectorAll('h4, [class*="title"], strong, b'));
    const viewW = window.innerWidth;
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.left > viewW * 0.6 && rect.width > 10) {
        const t = el.innerText?.trim();
        if (t && t.length > 0 && t.length < 100 &&
            !/^\d{1,2}:\d{2}$/.test(t) &&
            !/^(Notes|หมายเหตุ|Tags|Assign|Follow|Resolve|Basic)/i.test(t)) {
          return t;
        }
      }
    }

    // 3. document.title fallback
    const titleRaw = (document.title || '').replace(/\s*[|–—]\s*.*/i, '').trim();
    if (titleRaw.length > 0 && titleRaw.length < 80 &&
        !/^(LINE\s*(Chat|Official|OA)|หน้าหลัก|Home)$/i.test(titleRaw)) {
      return titleRaw;
    }

    return null;
  }).catch(() => null);
}

// ---- ดึงชื่อลูกค้าจาก chat list item (fallback) ----
async function extractNameFromListItem(page, idx) {
  return page.evaluate((i) => {
    const items = document.querySelectorAll('.list-group-item-chat');
    const item  = items[i];
    if (!item) return null;

    const imgs = Array.from(item.querySelectorAll('img'));
    for (const img of imgs) {
      const alt = img.alt?.trim();
      if (alt && alt.length > 0 && alt.length < 80) return alt;
    }

    const link = item.querySelector('a[href="#"]');
    const titleName = link?.title?.trim() || link?.getAttribute('aria-label')?.trim();
    if (titleName && titleName.length > 0 && titleName.length < 80) return titleName;

    if (!link) return null;
    const lines = link.innerText?.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (!lines || !lines.length) return null;
    for (const line of lines) {
      if (/^\d{1,2}:\d{2}/.test(line))        continue;
      if (line.length > 40)                   continue;
      if (/^(You sent|ส่ง|photo|sticker|image|file|โปรดรอ|สวัสดี|ยินดีต้อน|ทำรายการ|รบกวน|Waiting|Please wait|ยอดเงิน|แอดมิน|ลูกค้า)/i.test(line)) continue;
      return line;
    }
    return null;
  }, idx).catch(() => null);
}

// ---- ดึง Notes จาก right panel (Box 4) ----
async function extractNotes(page) {
  return page.evaluate(() => {
    const results = [];

    // หา container ของ notes — LINE OA ใช้ section ที่มีหัว "Notes N/1000"
    // ลอง selector หลายแบบ
    const containers = [
      ...document.querySelectorAll('[class*="memo"], [class*="note-list"], [class*="notes"]'),
    ].filter(el => {
      // ต้องไม่ใช่ input หรือ button
      return !['INPUT', 'BUTTON', 'TEXTAREA'].includes(el.tagName);
    });

    // ถ้าไม่พบ ลองหาจาก section ที่มีข้อความ "Notes" ใกล้ๆ
    if (!containers.length) {
      const allEls = Array.from(document.querySelectorAll('*'));
      for (const el of allEls) {
        if (['INPUT', 'BUTTON', 'TEXTAREA', 'SCRIPT', 'STYLE'].includes(el.tagName)) continue;
        const text = el.innerText?.trim() || '';
        if (/^Notes\s+\d+\/\d+/i.test(text) || /^หมายเหตุ/i.test(text)) {
          // หา sibling หรือ parent ที่มี note items
          const parent = el.parentElement || el;
          containers.push(parent);
          break;
        }
      }
    }

    for (const container of containers) {
      // ลอง query note items
      const noteItems = container.querySelectorAll(
        '[class*="memo-item"], [class*="note-item"], [class*="memo-content"]'
      );

      if (noteItems.length > 0) {
        for (const item of noteItems) {
          const rawText = item.innerText?.trim() || '';
          if (!rawText) continue;

          // แยก timestamp + admin name ออกจาก body
          // pattern: ข้อความ\nDATE TIME ADMIN_NAME
          const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

          let noteText = rawText;
          let notedAt  = null;
          let notedBy  = null;

          // หา line สุดท้ายที่มี pattern วันที่ (M/D/YYYY, HH:MM)
          const lastLine = lines[lines.length - 1] || '';
          const dateMatch = lastLine.match(
            /(\d{1,2}\/\d{1,2}\/\d{4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+(.*)/i
          );
          if (dateMatch) {
            notedAt  = `${dateMatch[1]} ${dateMatch[2]}`;
            notedBy  = dateMatch[3].trim() || null;
            noteText = lines.slice(0, -1).join('\n').trim();
          } else {
            // ลองหา timestamp ใน time element
            const timeEl = item.querySelector('time');
            if (timeEl) {
              notedAt  = timeEl.getAttribute('datetime') || timeEl.innerText?.trim() || null;
              notedBy  = item.querySelector('[class*="author"], [class*="name"]')?.innerText?.trim() || null;
            }
          }

          if (noteText) results.push({ note_text: noteText, noted_at: notedAt, noted_by: notedBy });
        }
      } else {
        // ทั้ง container เป็น note เดียว
        const rawText = container.innerText?.trim() || '';
        if (!rawText || /^Notes\s+\d+\/\d+/i.test(rawText)) continue;

        const lines   = rawText.split('\n').map(l => l.trim()).filter(Boolean);
        let noteText  = rawText;
        let notedAt   = null;
        let notedBy   = null;

        const lastLine = lines[lines.length - 1] || '';
        const dateMatch = lastLine.match(
          /(\d{1,2}\/\d{1,2}\/\d{4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+(.*)/i
        );
        if (dateMatch) {
          notedAt  = `${dateMatch[1]} ${dateMatch[2]}`;
          notedBy  = dateMatch[3].trim() || null;
          noteText = lines.slice(0, -1).join('\n').trim();
        }

        if (noteText) results.push({ note_text: noteText, noted_at: notedAt, noted_by: notedBy });
      }
    }

    return results;
  }).catch(() => []);
}

// ---- Scroll chat panel ขึ้นจนถึง dateFrom ----
async function loadChatHistory(page, dateFrom, shouldCancel) {
  const targetMs  = dateFrom.getTime();
  const MAX_SCROLL = 60;

  for (let i = 0; i < MAX_SCROLL; i++) {
    const oldestMs = await page.evaluate(() => {
      function parseLineDate(raw) {
        if (!raw) return null;
        const TH = { 'ม.ค.': 0, 'ก.พ.': 1, 'มี.ค.': 2, 'เม.ย.': 3, 'พ.ค.': 4, 'มิ.ย.': 5,
                     'ก.ค.': 6, 'ส.ค.': 7, 'ก.ย.': 8, 'ต.ค.': 9, 'พ.ย.': 10, 'ธ.ค.': 11 };
        const m = raw.match(/(\d{1,2})\s+([ก-๙\.]+)\s+(\d{4})/);
        if (m && TH[m[2]] !== undefined) {
          const yr = parseInt(m[3]) > 2500 ? parseInt(m[3]) - 543 : parseInt(m[3]);
          return new Date(yr, TH[m[2]], parseInt(m[1]));
        }
        const d = new Date(raw);
        return isNaN(d) ? null : d;
      }
      const separators = Array.from(document.querySelectorAll('.chatsys-date'));
      if (!separators.length) return null;
      const txt = separators[0].innerText?.trim();
      if (!txt) return null;
      const d = parseLineDate(txt);
      return d ? d.getTime() : null;
    });

    if (oldestMs !== null && oldestMs <= targetMs) {
      process.stdout.write('📅');
      break;
    }

    if (shouldCancel && i % 5 === 4) {
      if (await shouldCancel()) return true;
    }

    const scrolled = await page.evaluate(() => {
      const chat = document.querySelector('.chat');
      if (!chat) return false;
      let el = chat.parentElement;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'overlay') {
          if (el.scrollHeight > el.clientHeight + 50) {
            el.scrollTop = 0; return true;
          }
        }
        el = el.parentElement;
      }
      return false;
    });

    if (!scrolled) {
      const chatCenter = await page.evaluate(() => {
        const el = document.querySelector('.chat');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 100 };
      });
      if (chatCenter) {
        await page.mouse.move(chatCenter.x, chatCenter.y);
        await page.mouse.wheel(0, -5000);
      } else break;
    }

    await page.waitForTimeout(800);
  }
  return false;
}

// ---- ดึง admin+customer messages จาก chat panel (Box 3) ----
async function extractAdminMessages(page, dateFrom, dateTo) {
  return page.evaluate(({ fromMs, toMs }) => {
    function parseLineDate(raw) {
      if (!raw) return null;
      const TH = { 'ม.ค.': 0, 'ก.พ.': 1, 'มี.ค.': 2, 'เม.ย.': 3, 'พ.ค.': 4, 'มิ.ย.': 5,
                   'ก.ค.': 6, 'ส.ค.': 7, 'ก.ย.': 8, 'ต.ค.': 9, 'พ.ย.': 10, 'ธ.ค.': 11 };
      const m = raw.match(/(\d{1,2})\s+([ก-๙\.]+)\s+(\d{4})/);
      if (m && TH[m[2]] !== undefined) {
        const yr = parseInt(m[3]) > 2500 ? parseInt(m[3]) - 543 : parseInt(m[3]);
        return new Date(yr, TH[m[2]], parseInt(m[1]));
      }
      const d = new Date(raw);
      return isNaN(d) ? null : d;
    }

    function extractTs(node, currentDate) {
      const timeEl  = node.querySelector('time, [class*="chat-time"], .chat-secondary time');
      const rawTime = timeEl?.getAttribute('datetime') || timeEl?.innerText?.trim() || '';
      if (!rawTime) return null;

      // Full datetime (ISO / RFC2822)
      if (rawTime.length > 5) {
        const fullDate = new Date(rawTime);
        if (!isNaN(fullDate)) return fullDate.toISOString();
      }

      // HH:MM + currentDate
      const parts = rawTime.match(/^(\d{1,2}):(\d{2})$/);
      if (parts && currentDate) {
        const d = new Date(currentDate);
        d.setHours(parseInt(parts[1]), parseInt(parts[2]), 0, 0);
        return isNaN(d) ? null : d.toISOString();
      }
      return null;
    }

    // ดึงชื่อ admin จาก chat-reverse node
    // LINE OA แสดงชื่อ admin ใน: .chat-profile, [class*="agent"], .chat-content header area
    function extractAdminName(node) {
      // วิธีที่ 1: element ที่ชัดเจน
      const nameSelectors = [
        '[class*="agent-name"]',
        '[class*="admin-name"]',
        '[class*="member-name"]',
        '[class*="sender-name"]',
        '.chat-profile [class*="name"]',
        '.chat-name',
      ];
      for (const sel of nameSelectors) {
        const el = node.querySelector(sel);
        if (el) {
          const t = el.innerText?.trim();
          if (t && t.length > 0 && t.length < 60) return t;
        }
      }

      // วิธีที่ 2: .chat-content — ตัด message body ออก แล้วดึงข้อความที่เหลือ
      const contentEl = node.querySelector('.chat-content');
      if (contentEl) {
        const clone = contentEl.cloneNode(true);
        clone.querySelectorAll('.chat-body, .chat-main, .chat-item, .chat-secondary, time').forEach(e => e.remove());
        const remaining = clone.innerText?.trim().split('\n')[0]?.trim() || null;
        if (remaining && remaining.length > 0 && remaining.length < 60) return remaining;
      }

      // วิธีที่ 3: หา text node ที่อยู่นอก bubble ในฝั่งขวา
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
      let txtNode;
      while ((txtNode = walker.nextNode())) {
        const t = txtNode.textContent?.trim();
        if (t && t.length > 1 && t.length < 60 && !/^\d{1,2}:\d{2}/.test(t)) {
          // ต้องไม่ใช่ข้อความใน bubble
          const parent = txtNode.parentElement;
          if (parent && !parent.classList.contains('chat-item-text') &&
              !parent.closest('.chat-item-text') &&
              !parent.closest('.chat-bubble')) {
            return t;
          }
        }
      }
      return null;
    }

    const results = [];
    let currentDate      = null;
    let lastCustomerText = null;
    let lastCustomerTs   = null;
    let lastAdminName    = null;

    const allNodes = Array.from(document.querySelectorAll('.chatsys-date, .chat'));

    for (const node of allNodes) {
      // Date separator
      if (node.classList.contains('chatsys-date')) {
        const raw = node.innerText?.trim();
        if (raw) {
          const parsed = parseLineDate(raw);
          if (parsed) currentDate = parsed;
        }
        continue;
      }

      // ข้อความลูกค้า (ซ้าย) — ไม่มี chat-reverse, ไม่ใช่ chatsys
      if (!node.classList.contains('chat-reverse') && !node.className.includes('chatsys')) {
        // ลอง selector หลายแบบสำหรับ bubble ข้อความ
        const custEl = node.querySelector(
          '.chat-item-text.user-select-text, .chat-item-text, [class*="chat-text"], [class*="message-text"]'
        );
        const custText = custEl?.innerText?.trim() || '';
        if (custText) {
          lastCustomerText = custText;
          lastCustomerTs   = extractTs(node, currentDate);
        }
        continue;
      }

      if (!node.classList.contains('chat-reverse')) continue;

      // ข้อความ admin (ขวา)
      const textEl = node.querySelector(
        '.chat-item-text.user-select-text, .chat-item-text, [class*="chat-text"], [class*="message-text"]'
      );
      const text = textEl?.innerText?.trim() || '';
      if (!text || text.length < 1) continue;

      const tsIso = extractTs(node, currentDate);
      const ts    = tsIso ? new Date(tsIso) : null;

      // กรองช่วงวันที่
      if (ts && !isNaN(ts)) {
        if (ts.getTime() < fromMs || ts.getTime() > toMs) continue;
      } else if (currentDate) {
        if (currentDate.getTime() < fromMs || currentDate.getTime() > toMs) continue;
      }

      // ชื่อ admin — carry-forward ถ้า LINE ซ่อนชื่อ
      let adminName = extractAdminName(node);
      if (!adminName && lastAdminName) adminName = lastAdminName;
      if (adminName) lastAdminName = adminName;

      results.push({
        text,
        adminName,
        timestamp: tsIso,
        customerText: lastCustomerText,
        customerTs:   lastCustomerTs,
      });
    }

    return results;
  }, { fromMs: dateFrom.getTime(), toMs: dateTo.getTime() });
}

// ---- Job Runner ----
async function runJob(job) {
  console.log(`\n📋 รับงาน: ${job.date_from} → ${job.date_to}`);
  await updateJob(job.id, { status: 'running' });

  // date_from อาจมาเป็น "2026-05-17" หรือ "2026-05-17T00:00:00.000Z" — ตัดให้เหลือแค่ YYYY-MM-DD
  const datePart = s => String(s).slice(0, 10);
  const dateFrom = new Date(datePart(job.date_from) + 'T00:00:00');
  const dateTo   = new Date(datePart(job.date_to)   + 'T23:59:59');

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page    = await context.newPage();

  try {
    await page.goto('https://chat.line.biz/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('signin') || page.url().includes('login')) {
      await updateJob(job.id, { status: 'error', error_text: 'Session หมดอายุ — รัน: node login.js' });
      await browser.close().catch(() => {});
      console.error('\n🔐 Session หมดอายุ — ต้อง login ใหม่');
      process.exit(2);
    }

    await page.waitForSelector('.list-group-item-chat', { timeout: 15000 });

    // โหลด chat list จนถึงวันที่เป้าหมาย พร้อมเก็บ timestamp label ทุก item
    const { total, itemLabels } = await loadChatListWithDates(page, dateFrom);
    await updateJob(job.id, { total_chats: total });

    let logged      = 0;
    let notes_saved = 0;
    let wasCancelled = false;

    for (let i = 0; i < total; i++) {
      try {
        // ---- กรอง 1: ตรวจ timestamp ของ chat item ก่อน click ----
        const label   = itemLabels[i] || '';
        const chatDay = dayLabelToDate(label);

        if (chatDay) {
          // chat เก่ากว่า dateFrom → หยุด (list เรียงใหม่ไป เก่า)
          if (chatDay.getTime() < dateFrom.getTime()) {
            console.log(`\n📅 chat #${i + 1} วันที่ "${label}" < dateFrom — หยุด loop`);
            break;
          }
          // chat ใหม่กว่า dateTo → ข้าม
          if (chatDay.getTime() > dateTo.getTime()) {
            process.stdout.write('⏭');
            continue;
          }
        }

        // ดึงชื่อ pre-click สำหรับ fallback
        const listName = await extractNameFromListItem(page, i);

        // Click chat
        const item = page.locator('.list-group-item-chat').nth(i);
        await item.click();

        try { await page.waitForURL(/\/U[a-f0-9]{32}/i, { timeout: 8000 }); } catch {}
        await page.waitForTimeout(1500);

        const url = page.url();
        const m   = url.match(/\/(U[a-f0-9]{32})/i);
        if (!m) { console.log(`  ข้ามแชท ${i + 1} — ไม่พบ user ID ใน URL`); continue; }
        const lineUserId = m[1];

        // ---- กรอง 2: ต้องมี admin ตอบล่าสุดแล้ว ----
        const lastMsgIsAdmin = await page.evaluate(() => {
          const msgs = Array.from(document.querySelectorAll('.chat')).filter(
            el => !el.className.includes('chatsys')
          );
          if (!msgs.length) return false;
          return msgs[msgs.length - 1].classList.contains('chat-reverse');
        });
        if (!lastMsgIsAdmin) { process.stdout.write('○'); continue; }

        // ---- กรอง 3: ต้องผ่าน MIN_IDLE_MIN ----
        const idleEnough = await page.evaluate((minIdleMs) => {
          const adminMsgs = Array.from(document.querySelectorAll('.chat.chat-reverse'))
            .filter(el => !el.className.includes('chatsys'));
          if (!adminMsgs.length) return true;

          const last = adminMsgs[adminMsgs.length - 1];
          const timeWithAttr = last.querySelector('time[datetime]');
          if (timeWithAttr) {
            const ts = new Date(timeWithAttr.getAttribute('datetime'));
            if (!isNaN(ts)) return (Date.now() - ts.getTime()) >= minIdleMs;
          }

          const timePattern = /^(\d{1,2}):(\d{2})$/;
          const walker = document.createTreeWalker(last, NodeFilter.SHOW_TEXT, null);
          let node;
          while ((node = walker.nextNode())) {
            const txt = node.textContent.trim();
            const mp  = txt.match(timePattern);
            if (mp) {
              const d = new Date();
              d.setHours(parseInt(mp[1]), parseInt(mp[2]), 0, 0);
              let msgTs = d.getTime();
              if (msgTs > Date.now()) msgTs -= 86400000;
              return (Date.now() - msgTs) >= minIdleMs;
            }
          }
          return false;
        }, MIN_IDLE_MIN * 60 * 1000).catch(() => false);

        if (!idleEnough) { process.stdout.write('⏳'); continue; }

        // ---- ดึงชื่อลูกค้าจาก right panel (Box 2) ----
        const panelName  = await extractCustomerNameFromPanel(page);
        const displayName = panelName || listName || null;

        const upd = await updateJob(job.id, { current_chat: displayName || lineUserId, logged_count: logged });
        if (upd?.cancelled) {
          console.log('\n🚫 Job ถูกยกเลิกจากเว็บ — หยุด scrape');
          wasCancelled = true; break;
        }

        // ---- Scroll chat ขึ้นจนถึง dateFrom ----
        const abortedLoad = await loadChatHistory(page, dateFrom, async () => {
          const r = await updateJob(job.id, {});
          return r?.cancelled === true;
        });
        if (abortedLoad) {
          console.log('\n🚫 Job ถูกยกเลิกระหว่าง loadChatHistory — หยุด scrape');
          wasCancelled = true; break;
        }

        // ---- ดึง messages (Box 3) ----
        const msgs = await extractAdminMessages(page, dateFrom, dateTo);

        // ---- ดึง Notes (Box 4) ----
        const notesList = await extractNotes(page);

        if (!msgs.length && !notesList.length) { process.stdout.write('.'); continue; }

        console.log(`\n  [${i + 1}/${total}] "${displayName || lineUserId.slice(0, 12)}" [src:${panelName ? 'panel' : listName ? 'list' : '?'}] (${lineUserId.slice(0, 8)}): ${msgs.length} ข้อความ, ${notesList.length} note`);

        // บันทึก messages
        for (const msg of msgs) {
          if (wasCancelled) break;
          const r = await postReply(lineUserId, msg.text, msg.adminName, msg.customerText, msg.timestamp, msg.customerTs, displayName);
          if (r?.ok) {
            console.log(`    ✅ score ${r.qc?.finalScore ?? 'no-cust'} (${msg.adminName || 'ไม่รู้ชื่อ'}) "${msg.text.slice(0, 40)}"${msg.customerText ? ` | ❓"${msg.customerText.slice(0, 30)}"` : ''}`);
            logged++;
          } else {
            console.log(`    ⚠️ [${r?.error}] "${msg.text.slice(0, 40)}"`);
          }
          const chk = await updateJob(job.id, { logged_count: logged });
          if (chk?.cancelled) { wasCancelled = true; break; }
        }

        // บันทึก notes
        for (const note of notesList) {
          if (wasCancelled) break;
          const r = await postNote(lineUserId, note.note_text, note.noted_at, note.noted_by);
          if (r?.ok && r.inserted) {
            console.log(`    📝 Note บันทึก: "${note.note_text.slice(0, 50)}" (${note.noted_by || '?'} @ ${note.noted_at || '?'})`);
            notes_saved++;
          }
        }

        if (wasCancelled) {
          console.log('\n🚫 Job ถูกยกเลิกระหว่างส่งข้อมูล — หยุด scrape'); break;
        }
      } catch (e) {
        console.log(`\n  ⚠️ index ${i}: ${e.message}`);
      }
    }

    if (wasCancelled) {
      console.log(`\n🚫 ยกเลิกแล้ว — บันทึก QC ${logged} ข้อความ, ${notes_saved} notes`);
    } else {
      await updateJob(job.id, { status: 'done', logged_count: logged, current_chat: null });
      console.log(`\n✅ เสร็จ — บันทึก QC ${logged} ข้อความ, ${notes_saved} notes`);
    }
  } catch (err) {
    await updateJob(job.id, { status: 'error', error_text: err.message });
    console.error('❌', err.message);
  } finally {
    await browser.close();
  }
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
  console.log('='.repeat(50));
  console.log('  QC Scraper v2');
  console.log('='.repeat(50));

  if (!API_URL) { console.error('❌ ตั้งค่า QC_API_URL ใน .env'); process.exit(1); }
  if (!fs.existsSync(AUTH_FILE)) { console.error('❌ ไม่พบ auth.json — รัน: node login.js ก่อน'); process.exit(1); }

  console.log(`🌐 API  : ${API_URL}`);
  console.log(`🔑 Key  : ${API_KEY ? API_KEY.slice(0, 6) + '...' : '(ไม่ได้ตั้ง)'}`);
  console.log(`🖥️  Mode : ${HEADLESS ? 'headless' : 'headed (มีหน้าต่าง browser)'}`);
  if (SCHEDULE_MIN > 0) console.log(`⏰ Auto : ทุก ${SCHEDULE_MIN} นาที`);
  else console.log(`⏰ Mode : รอรับ job จากหน้าเว็บ`);
  console.log(`💤 Idle : ข้ามแชทที่ admin ตอบล่าสุดน้อยกว่า ${MIN_IDLE_MIN} นาที`);
  console.log('='.repeat(50));
  console.log();

  if (SCHEDULE_MIN > 0) {
    await createAutoJob();
    setInterval(createAutoJob, SCHEDULE_MIN * 60 * 1000);
  }

  await loop();
  if (WATCH || SCHEDULE_MIN > 0) {
    if (WATCH) console.log(`⏰ poll ทุก ${POLL_MS / 1000}s`);
    setInterval(loop, POLL_MS);
  }
})();

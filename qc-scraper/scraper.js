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

// จำนวนลูกค้า (LINE user) สูงสุดที่จะ scrape ต่อ job — ไม่นับ skip/system chat
const limitArg     = process.argv.find(a => a.startsWith('--limit='));
const CUSTOMER_LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : parseInt(process.env.CUSTOMER_LIMIT || '100');

const toISO = d => d.toISOString().slice(0, 10);

// แปลง "M/D/YYYY, HH:MM" (LINE OA note format) → ISO timestamp
function parseNotedAt(str) {
  if (!str) return null;
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);
  if (!m) return null;
  let [, mo, d, yr, h, mi, se = '00', ampm] = m;
  h = parseInt(h); mi = parseInt(mi); se = parseInt(se);
  if (ampm) {
    if (/pm/i.test(ampm) && h < 12) h += 12;
    if (/am/i.test(ampm) && h === 12) h = 0;
  }
  const dt = new Date(parseInt(yr), parseInt(mo) - 1, parseInt(d), h, mi, se);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

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

  // "May 20" / "Apr 15" / "May 20, 2026" (อาจแสดงใน LINE OA บางภาษา)
  const monDayRE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:[,\s]+(\d{4}))?$/i;
  const mdMatch = s.match(monDayRE);
  if (mdMatch) {
    const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const mo = MONTHS[mdMatch[1].toLowerCase().replace('.','')];
    if (mo !== undefined) {
      const yr = mdMatch[3] ? parseInt(mdMatch[3]) : today.getFullYear();
      const d = new Date(yr, mo, parseInt(mdMatch[2]));
      if (!mdMatch[3] && d.getTime() > today.getTime()) d.setFullYear(yr - 1);
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
    if (b > 12) return new Date(yr, a - 1, b);
    if (a > 12) return new Date(yr, b - 1, a);
    return new Date(yr, a - 1, b);
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

// ---- scroll chat list ลง ----
async function scrollChatListDown(page, multiplier = 1) {
  return page.evaluate((mult) => {
    const item = document.querySelector('.list-group-item-chat');
    if (!item) return false;
    let el = item.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'overlay') &&
          el.scrollHeight > el.clientHeight + 50) {
        const before = el.scrollTop;
        el.scrollTop += Math.max(el.clientHeight * 0.75, 200) * mult;
        return el.scrollTop !== before;
      }
      el = el.parentElement;
    }
    return false;
  }, multiplier);
}

// ---- ดึงชื่อลูกค้าจาก document.title (Box 2) ----
// LINE OA ตั้ง title เป็น "ชื่อลูกค้า | LINE Official Account Manager"
// ใช้ waitForFunction เพื่อรอให้ title update หลัง right panel โหลดเสร็จ
async function extractCustomerNameFromPanel(page) {
  // poll title ทุก 200ms นานสูงสุด 4s — รอให้ LINE OA อัปเดต title
  const fromTitle = await page.waitForFunction(
    () => {
      const raw = (document.title || '').replace(/\s*[|–—]\s*.*/i, '').trim();
      if (!raw || raw.length >= 60) return false;
      if (/^LINE\s*(Official|Chat|OA|Biz)/i.test(raw)) return false;
      if (/Official\s*Account/i.test(raw)) return false;
      if (/^(หน้าหลัก|Home|Manager|Account\s*Manager|Chat)$/i.test(raw)) return false;
      if (!/[฀-๿a-zA-Z0-9]/.test(raw)) return false;
      // ปฏิเสธประโยค — ชื่อไม่ควรมีคำว่า photo/message/reply/video/sticker
      if (/\b(photo|message|replying|image|video|sticker|audio|file)\b/i.test(raw)) return false;
      // ปฏิเสธถ้ามีคำมากกว่า 6 คำ (ชื่อไม่ยาวขนาดนี้)
      if (raw.split(/\s+/).length > 6) return false;
      return raw;
    },
    null,
    { timeout: 4000, polling: 200 }
  ).then(h => h.jsonValue()).catch(() => null);

  if (fromTitle && typeof fromTitle === 'string') return fromTitle;

  // Fallback: structural approach — LINE OA ใช้ hashed class ทำให้ [class*=...] ไม่ match
  // แทนด้วย: img[alt] ในส่วน header ของ right panel + heading elements
  return page.evaluate(() => {
    // Strategy 1: img[alt] ที่อยู่ใกล้ด้านบนของ right panel (avatar ลูกค้า)
    for (const img of document.querySelectorAll('img[alt]')) {
      const alt = img.alt?.trim();
      if (!alt || alt.length < 2 || alt.length >= 80) continue;
      if (!/[฀-๿a-zA-Z0-9]/.test(alt)) continue;
      if (/^(photo|image|avatar|icon|logo|sticker|LINE|emoji)$/i.test(alt)) continue;
      const rect = img.getBoundingClientRect();
      // ต้องอยู่ใกล้บนสุด (top < 15%) และอยู่ฝั่งขวา (left > 25%)
      if (rect.top < window.innerHeight * 0.15 && rect.left > window.innerWidth * 0.25) {
        return alt;
      }
    }
    // Strategy 2: heading/strong ที่อยู่บน right panel
    for (const el of document.querySelectorAll('h1, h2, h3, strong, b')) {
      const rect = el.getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.15) continue;
      if (rect.left < window.innerWidth * 0.25) continue;
      const t = el.innerText?.trim();
      if (t && t.length >= 2 && t.length < 80 &&
          /[฀-๿a-zA-Z0-9]/.test(t) &&
          !/^LINE/i.test(t)) return t;
    }
    return null;
  }).catch(() => null);
}


// ---- ดึง Notes จาก right panel (Box 4) ----
// กลยุทธ์: หาทุก element ที่มีรูปแบบ "M/D/YYYY, HH:MM AdminName" และไม่อยู่ใน chat messages panel
// เพราะ LINE OA ทุก note จะจบด้วย timestamp + ชื่อ admin เสมอ
async function extractNotes(page) {
  return page.evaluate(() => {
    const results = [];
    const DATE_RE = /^(\d{1,2}\/\d{1,2}\/\d{4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s+(.+)$/;
    const UI_SKIP = /^(Add tags?|Assign(ed)?|Follow up|Resolve|Search|Notes\s*\d*|Basic|\+|Edit|Delete|Save|Cancel|×|✏️|🗑️|Tag|Label|Follow-up)$/i;

    // หา chat messages container เพื่อ exclude — ป้องกันดึง chat bubble มาเป็น note
    const chatContainer = (() => {
      const dateEl = document.querySelector('.chatsys-date');
      if (!dateEl) return null;
      let el = dateEl.parentElement;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'overlay') &&
            el.scrollHeight > el.clientHeight + 50) return el;
        el = el.parentElement;
      }
      return null;
    })();

    // fallback: ถ้าหา chat container ไม่เจอ ใช้ position x > 50% (กว้างขึ้นจากเดิม 55%)
    const isExcluded = chatContainer
      ? (el) => chatContainer.contains(el)
      : (el) => el.getBoundingClientRect().left < window.innerWidth * 0.50;

    const allEls = Array.from(document.querySelectorAll('*'));
    const noteEls = [];

    for (const el of allEls) {
      if (['INPUT','TEXTAREA','BUTTON','SCRIPT','STYLE','SVG','IMG','CANVAS'].includes(el.tagName)) continue;
      if (isExcluded(el)) continue; // ข้าม chat messages / left panel
      const rect = el.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 30) continue; // ต้องมีขนาดพอสมควร

      const text = el.innerText?.trim() || '';
      if (text.length < 10) continue;

      // ต้องมี date pattern อยู่ในข้อความ
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const hasDate = lines.some(l => DATE_RE.test(l));
      if (!hasDate) continue;

      // ต้องไม่ใช่ container ที่ใหญ่เกินไป (มี note หลายอัน → ให้ลูกหลานจัดการ)
      if (lines.length > 40) continue;

      noteEls.push(el);
    }

    // เอาเฉพาะ element ที่เล็กที่สุด (ไม่มีลูกใน noteEls) = ตัว note จริงๆ
    const leafNotes = noteEls.filter(el =>
      !noteEls.some(other => other !== el && other.contains(el))
    );

    for (const el of leafNotes) {
      const text  = el.innerText?.trim() || '';
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      // หา line สุดท้ายที่เป็น date line
      let notedAt = null, notedBy = null, dateIdx = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        const m = lines[i].match(DATE_RE);
        if (m) {
          notedAt  = `${m[1]}, ${m[2]}`;
          notedBy  = m[3].trim() || null;
          dateIdx  = i;
          break;
        }
      }

      // content = ทุก line ก่อน date line โดยกรอง UI text ทิ้ง
      const contentLines = (dateIdx >= 0 ? lines.slice(0, dateIdx) : lines)
        .filter(l => !UI_SKIP.test(l));

      const noteText = contentLines.join('\n').trim();
      if (noteText) results.push({ note_text: noteText, noted_at: notedAt, noted_by: notedBy });
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
        // "DD ม.ค. YYYY" — Thai full date
        const TH = { 'ม.ค.': 0, 'ก.พ.': 1, 'มี.ค.': 2, 'เม.ย.': 3, 'พ.ค.': 4, 'มิ.ย.': 5,
                     'ก.ค.': 6, 'ส.ค.': 7, 'ก.ย.': 8, 'ต.ค.': 9, 'พ.ย.': 10, 'ธ.ค.': 11 };
        const mTH = raw.match(/(\d{1,2})\s+([ก-๙\.]+)\s+(\d{4})/);
        if (mTH && TH[mTH[2]] !== undefined) {
          const yr = parseInt(mTH[3]) > 2500 ? parseInt(mTH[3]) - 543 : parseInt(mTH[3]);
          return new Date(yr, TH[mTH[2]], parseInt(mTH[1]));
        }
        // "Mon, May 18" / "Tue May 19" — LINE OA chat separator format (no year)
        const MO = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
        const mEn = raw.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,.\s]+([A-Za-z]{3})\s+(\d{1,2})/i);
        if (mEn && MO[mEn[1].toLowerCase()] !== undefined) {
          const mo = MO[mEn[1].toLowerCase()], day = parseInt(mEn[2]);
          const now = new Date(); now.setHours(0,0,0,0);
          let d = new Date(now.getFullYear(), mo, day);
          if (d.getTime() > now.getTime()) d = new Date(now.getFullYear() - 1, mo, day);
          return d;
        }
        // Yesterday / Today / HH:MM
        const t = new Date(); t.setHours(0,0,0,0);
        if (/เมื่อวาน|yesterday/i.test(raw)) { const d=new Date(t); d.setDate(d.getDate()-1); return d; }
        if (/^วันนี้$|^today$/i.test(raw.trim()) || /^\d{1,2}:\d{2}$/.test(raw.trim())) return new Date(t);
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
      // "DD ม.ค. YYYY" — Thai full date
      const TH = { 'ม.ค.': 0, 'ก.พ.': 1, 'มี.ค.': 2, 'เม.ย.': 3, 'พ.ค.': 4, 'มิ.ย.': 5,
                   'ก.ค.': 6, 'ส.ค.': 7, 'ก.ย.': 8, 'ต.ค.': 9, 'พ.ย.': 10, 'ธ.ค.': 11 };
      const mTH = raw.match(/(\d{1,2})\s+([ก-๙\.]+)\s+(\d{4})/);
      if (mTH && TH[mTH[2]] !== undefined) {
        const yr = parseInt(mTH[3]) > 2500 ? parseInt(mTH[3]) - 543 : parseInt(mTH[3]);
        return new Date(yr, TH[mTH[2]], parseInt(mTH[1]));
      }
      // "Mon, May 18" / "Tue May 19" — LINE OA chat separator format (no year)
      const MO = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
      const mEn = raw.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,.\s]+([A-Za-z]{3})\s+(\d{1,2})/i);
      if (mEn && MO[mEn[1].toLowerCase()] !== undefined) {
        const mo = MO[mEn[1].toLowerCase()], day = parseInt(mEn[2]);
        const now = new Date(); now.setHours(0,0,0,0);
        let d = new Date(now.getFullYear(), mo, day);
        if (d.getTime() > now.getTime()) d = new Date(now.getFullYear() - 1, mo, day);
        return d;
      }
      // Yesterday / Today / HH:MM
      const t = new Date(); t.setHours(0,0,0,0);
      if (/เมื่อวาน|yesterday/i.test(raw)) { const d=new Date(t); d.setDate(d.getDate()-1); return d; }
      if (/^วันนี้$|^today$/i.test(raw.trim()) || /^\d{1,2}:\d{2}$/.test(raw.trim())) return new Date(t);
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
    // กลยุทธ์ใหม่: LINE OA ใช้ hashed CSS class ทำให้ [class*="agent-name"] ไม่ match
    // ใช้ img[alt] (profile picture) เป็น primary + text nodes นอก bubble เป็น fallback
    function extractAdminName(node) {
      // วิธีที่ 1: img[alt] — profile picture ของ admin มักมีชื่อเป็น alt text
      for (const img of node.querySelectorAll('img')) {
        const alt = img.alt?.trim();
        if (!alt || alt.length < 2 || alt.length > 50) continue;
        if (!/[฀-๿a-zA-Z]/.test(alt)) continue;
        if (/^(photo|image|avatar|icon|sticker|emoji|undefined|null)$/i.test(alt)) continue;
        return alt;
      }

      // วิธีที่ 2: text nodes ที่ไม่อยู่ใน .chat-item-text bubble
      // .chat-item-text เป็น class ที่ใช้ได้ผลจริง (ดึงข้อความได้อยู่แล้ว)
      const bubble = node.querySelector('.chat-item-text');
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
      let txtNode;
      while ((txtNode = walker.nextNode())) {
        const t = txtNode.textContent?.trim();
        if (!t || t.length < 2 || t.length > 50) continue;
        if (/^\d{1,2}:\d{2}/.test(t)) continue;          // ข้าม timestamp
        if (!/[฀-๿a-zA-Z]/.test(t)) continue;            // ต้องมี Thai/EN
        if (bubble && bubble.contains(txtNode.parentElement)) continue; // ข้ามข้อความใน bubble
        return t;
      }

      // วิธีที่ 3: title / aria-label attribute บน element ใดๆ ใน node
      for (const el of node.querySelectorAll('[title], [aria-label]')) {
        const t = (el.title || el.getAttribute('aria-label'))?.trim();
        if (!t || t.length < 2 || t.length > 50) continue;
        if (!/[฀-๿a-zA-Z]/.test(t)) continue;
        if (/^(close|delete|send|emoji|attach|like|heart|reaction|menu)$/i.test(t)) continue;
        return t;
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

    // โหมด historical: dateTo เป็นอดีตเกิน MIN_IDLE_MIN นาที
    const isHistorical = Date.now() - dateTo.getTime() > MIN_IDLE_MIN * 60 * 1000;
    if (isHistorical) console.log(`  📅 Historical mode — ข้าม filter lastMsgIsAdmin & idleEnough`);

    let logged      = 0;
    let notes_saved = 0;
    let wasCancelled = false;
    const processedUrls   = new Set(); // URL ที่เคยเปิดแล้ว
    const visitedCustomers = new Set(); // unique lineUserId สำหรับ CUSTOMER_LIMIT
    let totalSeen = 0;
    let outerDone = false;
    let diagDone = false;
    let skipCount = 0;
    let consecutiveAllSkip = 0;

    // scroll กลับบนสุดก่อนเริ่ม
    await page.evaluate(() => {
      const item = document.querySelector('.list-group-item-chat');
      if (!item) return;
      let el = item.parentElement;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'overlay') &&
            el.scrollHeight > el.clientHeight + 50) { el.scrollTop = 0; return; }
        el = el.parentElement;
      }
    });
    await page.waitForTimeout(600);

    // วน scroll ลง เปิดทุก item ที่เห็นใน DOM ขณะนั้น
    while (!outerDone && !wasCancelled) {
      const n = await page.locator('.list-group-item-chat').count();
      let roundClicked = 0;

      for (let i = 0; i < n && !outerDone && !wasCancelled; i++) {
        try {
          const item = page.locator('.list-group-item-chat').nth(i);

          // ดึง label (date badge ใน chat list) + listName + diagnostic
          const { label, listName, _dbg } = await item.evaluate((el, isFirst) => {
            const SINGLE_PATS = [
              /^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i,
              /^(yesterday|today)$/i,
              /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)$/i,
              /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/,
              /^(วันนี้|เมื่อวาน|จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์)$/,
            ];
            const MONTH_DAY_PAT = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,?\s*\d{4})?$/i;

            const raw = el.innerText || '';
            const tokens = raw.split(/\s+/).map(t => t.trim()).filter(Boolean);
            let label = '';

            // Pass 1: single token จากท้าย
            for (let i = tokens.length - 1; i >= 0; i--) {
              if (SINGLE_PATS.some(p => p.test(tokens[i]))) { label = tokens[i]; break; }
            }
            // Pass 2: สอง token "May 20" หรือ "May 20, 2026" จากท้าย
            if (!label && tokens.length >= 2) {
              for (let i = tokens.length - 2; i >= 0; i--) {
                const pair2 = tokens[i] + ' ' + tokens[i + 1];
                const pair3 = i + 2 < tokens.length ? tokens[i] + ' ' + tokens[i+1] + ' ' + tokens[i+2] : '';
                if (MONTH_DAY_PAT.test(pair3)) { label = pair3; break; }
                if (MONTH_DAY_PAT.test(pair2)) { label = pair2; break; }
              }
            }
            // Pass 3: ลอง attribute datetime / aria-label
            if (!label) {
              for (const child of el.querySelectorAll('[datetime],[aria-label],[title]')) {
                const v = (child.getAttribute('datetime') || child.getAttribute('aria-label') || child.getAttribute('title') || '').trim();
                if (v && (SINGLE_PATS.some(p => p.test(v)) || MONTH_DAY_PAT.test(v))) { label = v; break; }
              }
            }

            // ชื่อจาก img[alt]
            let listName = null;
            for (const img of el.querySelectorAll('img[alt]')) {
              const alt = img.alt?.trim();
              if (alt && alt.length >= 2 && alt.length < 60 &&
                  /[฀-๿a-zA-Z0-9]/.test(alt) &&
                  !/^(LINE|photo|image|avatar|icon|logo|sticker|emoji|gif)$/i.test(alt)) {
                listName = alt; break;
              }
            }

            // Diagnostic สำหรับ item แรก
            const _dbg = isFirst ? raw.slice(0, 120).replace(/\n/g, '↵') : null;
            return { label, listName, _dbg };
          }, i === 0 && !diagDone).catch(() => ({ label: null, listName: null, _dbg: null }));

          if (_dbg !== null) { diagDone = true; console.log(`\n=== ITEM#0 innerText: ${JSON.stringify(_dbg)} ===`); }
          if (label === null) { process.stdout.write('✗'); continue; }

          const chatDay = dayLabelToDate(label);
          // หยุดเมื่อ item เก่ากว่า dateFrom (list เรียงใหม่→เก่า)
          if (chatDay && chatDay.getTime() < dateFrom.getTime()) {
            console.log(`\n📅 "${label}" เก่ากว่า dateFrom — หยุด`);
            outerDone = true; break;
          }
          // ข้าม item ที่ label ใหม่กว่า dateTo (ทั้ง real-time และ historical)
          // historical: label "วันนี้" = conversation ยังมีแอดมินทำงานอยู่ หรือลูกค้าส่งข้อความใหม่
          // — ควรข้าม แล้วเลื่อนลงหา conversation ที่ label ตรง dateTo จริงๆ
          if (chatDay && chatDay.getTime() > dateTo.getTime()) {
            skipCount++;
            if (skipCount % 50 === 0) process.stdout.write(`[⏭${skipCount}]`);
            else process.stdout.write('⏭');
            continue;
          }

          // Click item — URL จะเปลี่ยนเป็น chat ของลูกค้า (LINE OA SPA)
          const urlBefore = page.url();
          await item.click().catch(() => {});
          try { await page.waitForURL(/\/U[a-f0-9]{32}/i, { timeout: 6000 }); } catch {}
          await page.waitForTimeout(800);

          const url = page.url();
          if (url === urlBefore) { process.stdout.write('✗'); continue; } // click ไม่ได้ผล
          if (processedUrls.has(url)) { process.stdout.write('↩'); continue; }
          processedUrls.add(url);
          totalSeen++;
          roundClicked++;

          const m = url.match(/\/(U[a-f0-9]{32})/i);
          if (!m) continue;
          const lineUserId = m[1];

          // CUSTOMER_LIMIT
          if (!visitedCustomers.has(lineUserId) && visitedCustomers.size >= CUSTOMER_LIMIT) {
            console.log(`\n🏁 ถึงลิมิต ${CUSTOMER_LIMIT} ลูกค้าแล้ว — หยุด`);
            outerDone = true; break;
          }
          visitedCustomers.add(lineUserId);
          await updateJob(job.id, { total_chats: totalSeen });

        // ---- กรอง 2: lastMsgIsAdmin (เฉพาะ real-time mode) ----
        if (!isHistorical) {
          const lastMsgIsAdmin = await page.evaluate(() => {
            const msgs = Array.from(document.querySelectorAll('.chat')).filter(
              el => !el.className.includes('chatsys')
            );
            if (!msgs.length) return false;
            return msgs[msgs.length - 1].classList.contains('chat-reverse');
          });
          if (!lastMsgIsAdmin) { process.stdout.write('○'); continue; }
        }

        // ---- กรอง 3: idleEnough (เฉพาะ real-time mode) ----
        if (!isHistorical) {
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
        }

        // ---- ดึงชื่อลูกค้าจาก title / header (Box 2) ----
        const panelName   = await extractCustomerNameFromPanel(page);
        const displayName = panelName || listName || lineUserId.slice(0, 16);

        const upd = await updateJob(job.id, { current_chat: displayName, logged_count: logged });
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

        // ถ้า LINE OA ไม่มี <time datetime> element scraper จะไม่ได้ timestamp
        // ผล: created_at ใน DB จะเป็น now() (วันที่ scrape) แทนวันที่จริง → report ไม่เจอ
        // Fix: ใช้ dateFrom+noon เป็น fallback timestamp เพื่อให้ created_at อยู่ในช่วงที่ถูกต้อง
        for (const msg of msgs) {
          if (!msg.timestamp) {
            const d = new Date(dateFrom);
            d.setHours(12, 0, 0, 0);
            msg.timestamp = d.toISOString();
          }
        }

        // ---- ดึง Notes (Box 4) ----
        const notesList = await extractNotes(page);

        if (!msgs.length && !notesList.length) {
          // debug: แสดงสิ่งที่เห็นใน chat panel เพื่อช่วย diagnose
          const dbg = await page.evaluate(() => {
            const dates  = Array.from(document.querySelectorAll('.chatsys-date')).map(d => d.innerText?.trim()).filter(Boolean);
            const admins = document.querySelectorAll('.chat.chat-reverse').length;
            const all    = document.querySelectorAll('.chat').length;
            return { dates: dates.slice(0, 3), admins, all };
          }).catch(() => ({}));
          process.stdout.write(`\n  . ${displayName.slice(0,20)} [lbl:${label}|d:${(dbg.dates||[]).join('|')},adm:${dbg.admins}/${dbg.all}]`);
          continue;
        }

        console.log(`\n  [${visitedCustomers.size}/${CUSTOMER_LIMIT}] "${displayName}" (${lineUserId.slice(0, 8)}): ${msgs.length} ข้อความ, ${notesList.length} note`);

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

        // บันทึก notes — แปลง noted_at string → ISO ก่อนส่ง API
        for (const note of notesList) {
          if (wasCancelled) break;
          const r = await postNote(lineUserId, note.note_text, parseNotedAt(note.noted_at), note.noted_by);
          if (r?.ok && r.inserted) {
            console.log(`    📝 Note บันทึก: "${note.note_text.slice(0, 50)}" (${note.noted_by || '?'} @ ${note.noted_at || '?'})`);
            notes_saved++;
          }
        }

        if (wasCancelled) {
          console.log('\n🚫 Job ถูกยกเลิกระหว่างส่งข้อมูล — หยุด scrape'); break;
        }
        } catch (e) {
          console.log(`\n  ⚠️ item ${i}: ${e.message}`);
        }
      } // end inner for

      if (outerDone || wasCancelled) break;

      // scroll list ลงเพื่อโหลด items ถัดไป
      if (isHistorical && roundClicked === 0) {
        consecutiveAllSkip++;
      } else {
        consecutiveAllSkip = 0;
      }
      const scrollMult = isHistorical && consecutiveAllSkip >= 3 ? 4 : 1;
      if (scrollMult > 1) console.log(`\n  🚀 scroll ×${scrollMult} (${consecutiveAllSkip} รอบ all-⏭)`);
      const scrolled = await scrollChatListDown(page, scrollMult);
      if (!scrolled) {
        if (isHistorical) {
          // LINE OA ใช้ infinite scroll — พอถึงท้ายรายการ ระบบจะโหลด conversation เพิ่มจาก server
          // รอ 2 วินาทีแล้ว retry ก่อนหยุดจริง
          console.log(`\n  ⏳ ถึงท้าย chat list — รอ LINE OA โหลดเพิ่ม...`);
          await page.waitForTimeout(2000);
          const scrolled2 = await scrollChatListDown(page, 1);
          if (!scrolled2) { console.log(`\n  🏁 โหลดครบแล้ว ไม่มี chat เพิ่ม — หยุด`); break; }
        } else {
          break;
        }
      }
      await page.waitForTimeout(600);
    } // end outer while

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

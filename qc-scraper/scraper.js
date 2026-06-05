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
// default = ไม่จำกัด (เก็บทุกแชทของ Yesterday จนกว่า Phase 2 จะ scroll พ้น zone)
// ตั้ง --limit=N หรือ CUSTOMER_LIMIT ใน .env เพื่อจำกัด (ใช้ตอนทดสอบ)
const limitArg     = process.argv.find(a => a.startsWith('--limit='));
const CUSTOMER_LIMIT = limitArg ? parseInt(limitArg.split('=')[1])
  : (process.env.CUSTOMER_LIMIT ? parseInt(process.env.CUSTOMER_LIMIT) : Infinity);
const LIMIT_LABEL = Number.isFinite(CUSTOMER_LIMIT) ? String(CUSTOMER_LIMIT) : 'ทั้งหมด';

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

const postReply = (uid, text, adminName, customerText, adminTs, customerTs, customerName, profile, messageType) =>
  apiFetch('/api/admin/log-reply', { method: 'POST', body: JSON.stringify({
    line_user_id:   uid,
    text,
    admin_name:     adminName,
    customer_text:  customerText    || null,
    admin_ts:       adminTs         || null,
    customer_ts:    customerTs      || null,
    customer_name:  customerName    || null,
    assigned_admin: profile?.assignedAdmin || null,
    phone:          profile?.phone  || null,
    email:          profile?.email  || null,
    message_type:   messageType     || 'text',
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
  // เป้าหมายคือ "เมื่อวาน" เสมอ
  const d = new Date(); d.setDate(d.getDate() - 1);
  const date = toISO(d);
  const r = await apiFetch('/api/scraper/job', {
    method: 'POST',
    body: JSON.stringify({ date_from: date, date_to: date }),
  });
  if (r?.ok) console.log(`\n🔄 [auto-job] สร้างงาน Yesterday (${date})`);
  else console.log(`\n⚠️ [auto-job] ${r?.error || 'error'}`);
}

// ---- scroll chat list ลง/ขึ้น + get/set scroll position ----
async function getScrollPos(page) {
  return page.evaluate(() => {
    const item = document.querySelector('.list-group-item-chat');
    if (!item) return 0;
    let el = item.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'overlay') &&
          el.scrollHeight > el.clientHeight + 50) return el.scrollTop;
      el = el.parentElement;
    }
    return 0;
  }).catch(() => 0);
}

async function scrollToPos(page, pos) {
  await page.evaluate((pos) => {
    const item = document.querySelector('.list-group-item-chat');
    if (!item) return;
    let el = item.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'overlay') &&
          el.scrollHeight > el.clientHeight + 50) { el.scrollTop = pos; return; }
      el = el.parentElement;
    }
  }, pos);
}

async function scrollChatListUp(page, multiplier = 1) {
  return page.evaluate((mult) => {
    const item = document.querySelector('.list-group-item-chat');
    if (!item) return false;
    let el = item.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'overlay') &&
          el.scrollHeight > el.clientHeight + 50) {
        const before = el.scrollTop;
        el.scrollTop -= Math.max(el.clientHeight * 0.75, 200) * mult;
        return el.scrollTop !== before;
      }
      el = el.parentElement;
    }
    return false;
  }, multiplier);
}

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

// ---- debug screenshot ----
const DEBUG_DIR = require('path').join(__dirname, 'debug');
async function saveScreenshot(page, name) {
  try {
    if (!require('fs').existsSync(DEBUG_DIR)) require('fs').mkdirSync(DEBUG_DIR, { recursive: true });
    await page.screenshot({ path: require('path').join(DEBUG_DIR, `${name}.png`), fullPage: false });
  } catch {}
}

// ---- ดึงชื่อลูกค้า + assigned_admin + phone + email จาก right panel (Box 2) ----
// ชื่อมาจาก document.title (primary) หรือ img[alt] (fallback)
// assigned_admin มาจาก element ใกล้ "assign" keyword ในแผงขวา
async function extractCustomerNameFromPanel(page) {
  // poll title ทุก 200ms นานสูงสุด 6s — รอให้ LINE OA อัปเดต title
  const fromTitle = await page.waitForFunction(
    () => {
      const raw = (document.title || '').replace(/\s*[|–—]\s*.*/i, '').trim();
      if (!raw || raw.length >= 60) return false;
      if (/^LINE\s*(Official|Chat|OA|Biz)/i.test(raw)) return false;
      if (/Official\s*Account/i.test(raw)) return false;
      if (/^(หน้าหลัก|Home|Manager|Account\s*Manager|Chat)$/i.test(raw)) return false;
      if (!/[฀-๿a-zA-Z0-9]/.test(raw)) return false;
      if (/\b(photo|message|replying|image|video|sticker|audio|file)\b/i.test(raw)) return false;
      if (/^\(.*\)$/.test(raw)) return false; // emoji/sticker alt เช่น "(happy face)"
      if (/hourglass|not.?done|pending|loading|\bface\b|ยังไม่|เสร็จ/i.test(raw)) return false;
      if (raw.split(/\s+/).length > 6) return false;
      return raw;
    },
    null,
    { timeout: 6000, polling: 200 }
  ).then(h => h.jsonValue()).catch(() => null);

  if (fromTitle && typeof fromTitle === 'string') return fromTitle;

  // Fallback: structural approach — LINE OA ใช้ hashed class ทำให้ [class*=...] ไม่ match
  // แทนด้วย: img[alt] ในส่วน header ของ right panel + heading elements
  return page.evaluate(() => {
    function isValidName(s) {
      if (!s || s.length < 2 || s.length >= 50) return false;
      if (!/[฀-๿a-zA-Z0-9]/.test(s)) return false;
      if (/^(LINE|photo|image|avatar|icon|logo|sticker|emoji|gif|video|audio|file)$/i.test(s)) return false;
      if (/\b(photo|image|replying|message|sticker|video|audio|file)\b/i.test(s)) return false;
      if (/^\(.*\)$/.test(s)) return false; // emoji/sticker alt เช่น "(happy face)"
      if (/hourglass|not.?done|pending|loading|\bface\b|ยังไม่|เสร็จ/i.test(s)) return false;
      if (s.split(/\s+/).length > 6) return false;
      return true;
    }
    // Strategy 1: img[alt] ที่อยู่ใกล้บนสุดของ right panel (avatar ลูกค้า)
    for (const img of document.querySelectorAll('img[alt]')) {
      const alt = img.alt?.trim();
      if (!isValidName(alt)) continue;
      const rect = img.getBoundingClientRect();
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
      if (isValidName(t) && !/^LINE/i.test(t)) return t;
    }
    return null;
  }).catch(() => null);
}


// ---- ดึง profile เพิ่มเติม: assigned_admin, phone, email จาก right panel (Box 2) ----
async function extractCustomerProfile(page) {
  const name = await extractCustomerNameFromPanel(page);

  const extra = await page.evaluate(() => {
    let assignedAdmin = null, phone = null, email = null;

    function inRightPanel(el) {
      const r = el.getBoundingClientRect();
      return r.left > window.innerWidth * 0.45 && r.width > 0 && r.height > 0;
    }

    // เก็บ text nodes ทั้งหมดในแผงขวา (leaf nodes เท่านั้น)
    const leafTexts = [];
    for (const el of document.querySelectorAll('span,p,div,button,a')) {
      if (!inRightPanel(el)) continue;
      if (el.children.length > 0) continue;
      const t = (el.innerText || el.textContent || '').trim();
      if (t && t.length > 0 && t.length < 120) leafTexts.push(t);
    }

    for (let i = 0; i < leafTexts.length; i++) {
      const t = leafTexts[i];
      // Phone
      if (!phone && /^0[0-9]{8,9}$/.test(t.replace(/[-\s]/g, ''))) { phone = t; continue; }
      // Email
      if (!email && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(t)) { email = t; continue; }
      // Assigned admin — element หลัง "Assigned to" / "ผู้รับผิดชอบ"
      if (!assignedAdmin && /assign|ผู้รับ|มอบหมาย/i.test(t)) {
        const next = leafTexts[i + 1] || '';
        if (next.length >= 2 && next.length < 60 && /[ก-๿a-zA-Z]/.test(next) &&
            !/^(assign|tag|note|follow|resolve|เพิ่ม|บันทึก)/i.test(next)) {
          assignedAdmin = next;
        }
      }
    }
    return { assignedAdmin, phone, email };
  }).catch(() => ({ assignedAdmin: null, phone: null, email: null }));

  return { name, ...extra };
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
        // ข้าม read receipt / status indicators ของ LINE OA
        if (/^(read|seen|delivered|sent|อ่านแล้ว|ส่งแล้ว|ได้รับแล้ว)$/i.test(t)) continue;
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

      // ข้อความ admin (ขวา) — ตรวจ type ก่อน
      const msgType = (() => {
        if (node.querySelector('img[src*="sticker"], [class*="sticker"]')) return 'sticker';
        if (node.querySelector('[class*="file"], [class*="document"], a[download]')) return 'file';
        if (node.querySelector('audio, video')) return 'media';
        if (node.querySelector('img:not([alt=""])')) {
          const imgs = node.querySelectorAll('img');
          for (const img of imgs) {
            if (!img.alt || !/^(read|seen|icon|avatar|logo)$/i.test(img.alt)) return 'image';
          }
        }
        return 'text';
      })();

      const textEl = node.querySelector(
        '.chat-item-text.user-select-text, .chat-item-text, [class*="chat-text"], [class*="message-text"]'
      );
      const text = textEl?.innerText?.trim() || (msgType !== 'text' ? `[${msgType}]` : '');
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
        timestamp:    tsIso,
        messageType:  msgType,
        customerText: lastCustomerText,
        customerTs:   lastCustomerTs,
      });
    }

    return results;
  }, { fromMs: dateFrom.getTime(), toMs: dateTo.getTime() });
}

// ---- เก็บข้อความทั้งหมดในแชท โดย scroll ไล่ลงทีละ viewport ----
// แก้ปัญหา virtual scroll: LINE OA render เฉพาะ message ที่มองเห็น
// loadChatHistory scroll ขึ้นบนสุดแล้ว — ฟังก์ชันนี้ไล่ลงล่าง เก็บสะสม (dedup) จนสุด
async function collectAllMessages(page, dateFrom, dateTo, shouldCancel) {
  const byKey = new Map(); // dedup: side|text|timestamp
  const addBatch = (batch) => {
    for (const m of batch) {
      const key = `${m.text}||${m.timestamp || ''}||${m.customerText || ''}`;
      if (!byKey.has(key)) byKey.set(key, m);
    }
  };

  // เริ่มจากบนสุด (loadChatHistory พาขึ้นบนสุดแล้ว) เผื่อ reset อีกครั้ง
  await page.evaluate(() => {
    const chat = document.querySelector('.chat');
    if (!chat) return;
    let el = chat.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if ((s.overflowY==='auto'||s.overflowY==='scroll'||s.overflowY==='overlay') && el.scrollHeight > el.clientHeight + 50) { el.scrollTop = 0; return; }
      el = el.parentElement;
    }
  }).catch(() => {});
  await page.waitForTimeout(400);

  let stable = 0;
  for (let i = 0; i < 80; i++) {
    addBatch(await extractAdminMessages(page, dateFrom, dateTo));

    if (shouldCancel && i % 5 === 4 && await shouldCancel()) break;

    const pos = await page.evaluate(() => {
      const chat = document.querySelector('.chat');
      if (!chat) return null;
      let el = chat.parentElement;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if ((s.overflowY==='auto'||s.overflowY==='scroll'||s.overflowY==='overlay') && el.scrollHeight > el.clientHeight + 50) {
          const before = el.scrollTop;
          el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + el.clientHeight * 0.7);
          return { before, after: el.scrollTop, atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 5 };
        }
        el = el.parentElement;
      }
      return null;
    });
    if (!pos) break; // ไม่มี scroll container = แชทสั้น อยู่ใน viewport เดียว
    await page.waitForTimeout(450);
    if (pos.atBottom || pos.after === pos.before) { stable++; if (stable >= 2) break; } else stable = 0;
  }
  return Array.from(byKey.values());
}

// ---- Job Runner ----
async function runJob(job) {
  console.log(`\n📋 รับงาน: ${job.date_from} → ${job.date_to}`);
  await updateJob(job.id, { status: 'running' });

  // เป้าหมายคือ "เมื่อวาน" เสมอ — ไม่ว่า job จะระบุวันไหนก็ตาม
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const dateFrom = new Date(toISO(yesterday) + 'T00:00:00');
  const dateTo   = new Date(toISO(yesterday) + 'T23:59:59');
  console.log(`  🎯 เป้าหมาย: Yesterday (${toISO(yesterday)})`);

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

    // Yesterday = historical เสมอ — ข้าม filter real-time ทั้งหมด
    const isHistorical = true;

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
    let consecutiveEmptyAfterTarget = 0;
    let reachedTargetZone = false;
    let yesterdayZoneEndScrollPos = 0; // scroll position ที่สิ้นสุด Yesterday zone (ใช้เริ่ม Phase 2)

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

    // =============================================
    // PHASE 1: SCAN — scroll ผ่านทั้งหมด ไม่ click
    // =============================================
    console.log('\n🔍 Phase 1: สแกนหา Yesterday zone...');

    let scanDone = false;
    const seenItemKeys    = new Set(); // dedup — ป้องกัน LINE OA virtual scroll cycling
    let lastScanScrollTop = -1;        // ตรวจ scroll ไม่เดินหน้า
    let scrollStuckCount  = 0;
    let phase1ZoneStartMs = 0;         // เวลาที่เริ่มพบ Yesterday zone
    const PHASE1_ZONE_MAX_MS = 90_000; // หลังพบ Yesterday zone ให้ scan ต่ออีก 90 วินาทีแล้วหยุด

    while (!scanDone && !wasCancelled) {
      const n = await page.locator('.list-group-item-chat').count();
      let foundOlderThanTarget = false;
      let foundYesterdayThisRound = false;
      let lastSeenLabel = null;
      let newItemsThisRound = 0;

      for (let i = 0; i < n && !foundOlderThanTarget; i++) {
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

            // ชื่อจาก img[alt] — avatar ของลูกค้าในรายการ
            let listName = null;
            for (const img of el.querySelectorAll('img[alt]')) {
              const alt = img.alt?.trim();
              if (!alt || alt.length < 2 || alt.length >= 50) continue;
              if (!/[฀-๿a-zA-Z0-9]/.test(alt)) continue;
              if (/^(LINE|photo|image|avatar|icon|logo|sticker|emoji|gif|video|audio|file)$/i.test(alt)) continue;
              if (/\b(photo|image|replying|message|sticker|video|audio|file)\b/i.test(alt)) continue;
              if (/hourglass|not.?done|pending|loading|clock|ยังไม่|เสร็จ/i.test(alt)) continue;
              if (alt.split(/\s+/).length > 5) continue;
              listName = alt; break;
            }

            // Fallback: บรรทัดแรกของ innerText = ชื่อลูกค้า (LINE OA format: "ชื่อ↵preview↵เวลา")
            if (!listName) {
              const firstLine = raw.split('\n')[0]?.trim() || '';
              if (firstLine.length >= 2 && firstLine.length < 50 &&
                  (/[฀-๿a-zA-Z]/.test(firstLine) || /\d{6,}/.test(firstLine)) &&
                  !/\b(photo|image|sticker|video|audio|file|ภาพ|วิดีโอ)\b/i.test(firstLine) &&
                  !/^\d{1,2}:\d{2}/.test(firstLine) &&
                  !/^(yesterday|today|เมื่อวาน|วันนี้|mon|tue|wed|thu|fri|sat|sun)/i.test(firstLine) &&
                  !/^\d{1,2}\/\d{1,2}/.test(firstLine)) {
                listName = firstLine;
              }
            }

            // Diagnostic สำหรับ item แรก
            const _dbg = isFirst ? raw.slice(0, 120).replace(/\n/g, '↵') : null;
            return { label, listName, _dbg };
          }, i === 0 && !diagDone).catch(() => ({ label: null, listName: null, _dbg: null }));

          if (_dbg !== null) { diagDone = true; console.log(`\n=== ITEM#0 innerText: ${JSON.stringify(_dbg)} ===`); }
          if (label === null) { process.stdout.write('✗'); continue; }
          lastSeenLabel = label;

          // dedup: ถ้าเคยเห็น item นี้แล้ว ข้ามเลย (LINE OA virtual scroll cycling)
          const itemKey = `${listName || ''}|${label}`;
          if (seenItemKeys.has(itemKey)) { continue; }
          seenItemKeys.add(itemKey);
          newItemsThisRound++;

          const chatDay = dayLabelToDate(label);
          // Phase 1: ตรวจ zone — ไม่ click
          if (chatDay && chatDay.getTime() < dateFrom.getTime()) {
            console.log(`\n📅 Scan: "${label}" เก่ากว่า Yesterday — สิ้นสุด scan`);
            yesterdayZoneEndScrollPos = await getScrollPos(page);
            foundOlderThanTarget = true; break;
          }
          if (chatDay && chatDay.getTime() > dateTo.getTime()) {
            skipCount++;
            if (skipCount % 200 === 0) process.stdout.write(`\n  [scan ⏭${skipCount}] "${listName || '?'}" (${label})`);
            else if (skipCount % 50 === 0) process.stdout.write(`[⏭${skipCount}]`);
            else process.stdout.write('⏭');
            continue;
          }
          // Yesterday item
          reachedTargetZone = true;
          foundYesterdayThisRound = true;
          process.stdout.write('📅');
          // ไม่ call getScrollPos ที่นี่ — เรียกครั้งเดียวหลัง inner loop
        } catch (e) {
          process.stdout.write('✗');
        }
      } // end inner for (Phase 1)

      // อัปเดต scroll position ครั้งเดียวต่อ round (ไม่ใช่ต่อ item)
      if (foundYesterdayThisRound) {
        yesterdayZoneEndScrollPos = await getScrollPos(page);
        const total = seenItemKeys.size;
        if (total % 200 === 0 || foundOlderThanTarget) process.stdout.write(`\n  [scan 📅zone scroll=${yesterdayZoneEndScrollPos}px items=${total}]`);
        // บันทึกเวลาที่เจอ Yesterday zone ครั้งแรก
        if (!phase1ZoneStartMs) { phase1ZoneStartMs = Date.now(); console.log(`\n  🎯 พบ Yesterday zone ครั้งแรก — scan ต่ออีก ${PHASE1_ZONE_MAX_MS/1000}s`); }
      }

      if (foundOlderThanTarget) { scanDone = true; break; }

      // หยุด Phase 1 หลังจาก scan ใน Yesterday zone ครบเวลา
      if (phase1ZoneStartMs && Date.now() - phase1ZoneStartMs > PHASE1_ZONE_MAX_MS) {
        console.log(`\n  ⏱️ Phase 1 ครบ ${PHASE1_ZONE_MAX_MS/1000}s ใน Yesterday zone — ดำเนิน Phase 2`);
        scanDone = true; break;
      }

      if (reachedTargetZone && !foundYesterdayThisRound) {
        consecutiveEmptyAfterTarget++;
        if (consecutiveEmptyAfterTarget >= 20) {
          console.log(`\n  ⏱️ ไม่พบ Yesterday chat ใหม่ ${consecutiveEmptyAfterTarget} รอบ — จบ scan`);
          scanDone = true; break;
        }
      } else {
        consecutiveEmptyAfterTarget = 0;
      }

      if (!reachedTargetZone) { consecutiveAllSkip++; } else { consecutiveAllSkip = 0; }

      const lastSeenDay = lastSeenLabel ? dayLabelToDate(lastSeenLabel) : null;
      const lastItemStillToday = !lastSeenDay || lastSeenDay.getTime() > dateTo.getTime();
      // Phase 1 = fast scan เพื่อหาจุดสิ้นสุด Yesterday zone เท่านั้น
      // ×20 ก่อน Yesterday, ×10 ใน/หลัง Yesterday (Phase 2 จะ cover ทุก item อีกครั้ง)
      const scrollMult = isHistorical && consecutiveAllSkip >= 2
        ? (lastItemStillToday ? 20 : 10) : 1;
      if (scrollMult > 1) process.stdout.write(`[×${scrollMult}]`);
      const scrolled = await scrollChatListDown(page, scrollMult);

      // ตรวจ scroll position — ถ้าไม่เดินหน้า = ถึงท้ายรายการจริงๆ
      const curScrollTop = await getScrollPos(page);
      if (curScrollTop <= lastScanScrollTop + 100 && lastScanScrollTop >= 0) {
        scrollStuckCount++;
        if (scrollStuckCount >= 4) {
          console.log(`\n  🏁 Scroll หยุดเดินหน้า (${curScrollTop}px) — สิ้นสุด chat list`);
          scanDone = true; break;
        }
      } else {
        scrollStuckCount = 0;
      }
      lastScanScrollTop = curScrollTop;

      // ถ้าไม่มี new unique items เลยใน round นี้ → ทุก item ซ้ำหมดแล้ว → scroll stuck
      if (newItemsThisRound === 0 && seenItemKeys.size > 100) {
        scrollStuckCount++;
        if (scrollStuckCount >= 4) {
          console.log(`\n  🏁 ไม่มี item ใหม่ ${scrollStuckCount} รอบ — สิ้นสุด chat list`);
          scanDone = true; break;
        }
      }

      if (!scrolled) {
        if (isHistorical) {
          // ถึงท้าย list หรือ LINE OA ยังโหลดไม่เสร็จ — retry หลายรอบก่อนยอมแพ้
          // (ป้องกัน false stop ตอน chat list โหลดช้าตอนเริ่ม เห็นแค่ไม่กี่ item)
          console.log(`\n  ⏳ ถึงท้าย chat list — รอ LINE OA โหลดเพิ่ม...`);
          let recovered = false;
          for (let r = 0; r < 4; r++) {
            await page.waitForTimeout(2500);
            // ลอง mouse-wheel เป็น fallback เผื่อ scrollTop ธรรมดาไม่ trigger lazy-load
            await page.evaluate(() => {
              const item = document.querySelector('.list-group-item-chat');
              if (!item) return;
              let el = item.parentElement;
              while (el && el !== document.body) {
                const s = getComputedStyle(el);
                if ((s.overflowY==='auto'||s.overflowY==='scroll'||s.overflowY==='overlay') && el.scrollHeight > el.clientHeight + 10) { el.scrollTop = el.scrollHeight; return; }
                el = el.parentElement;
              }
            }).catch(() => {});
            if (await scrollChatListDown(page, 1)) { recovered = true; break; }
            const cnt = await page.locator('.list-group-item-chat').count();
            if (cnt > seenItemKeys.size) { recovered = true; break; } // มี item ใหม่โผล่
          }
          if (!recovered) { console.log(`\n  🏁 โหลดครบแล้ว — จบ scan (${seenItemKeys.size} items)`); scanDone = true; break; }
        } else { scanDone = true; break; }
      }
      await page.waitForTimeout(600);
    } // end Phase 1 scan while

    if (!reachedTargetZone) {
      console.log('\n⚠️ ไม่พบ Yesterday zone ใน chat list');
      await updateJob(job.id, { status: 'done', logged_count: 0, current_chat: null });
      return;
    }
    console.log(`\n✅ Phase 1 เสร็จ — Yesterday zone ที่ scroll ~${yesterdayZoneEndScrollPos}px`);
    await saveScreenshot(page, '01_phase1_complete');

    // =============================================
    // PHASE 1.5: EXTEND — scroll ลงต่อจนถึงท้าย Yesterday zone จริงๆ
    // (Phase 1 อาจหยุดกลางทางเพราะ 90s limit — ต้องหาจุดสิ้นสุดที่แท้จริง)
    // =============================================
    console.log(`\n⬇️ Phase 1.5: ค้นหาจุดสิ้นสุด Yesterday zone จริงๆ (ไม่ click)...`);
    let extendDone = false;
    let extendStuckCount = 0;
    let lastExtendScrollPos = yesterdayZoneEndScrollPos;

    await scrollToPos(page, yesterdayZoneEndScrollPos);
    await page.waitForTimeout(600);

    while (!extendDone && !wasCancelled) {
      const n = await page.locator('.list-group-item-chat').count();
      let foundOlderInExtend = false;

      for (let i = 0; i < n && !foundOlderInExtend; i++) {
        const item = page.locator('.list-group-item-chat').nth(i);
        const label = await item.evaluate((el) => {
          const SINGLE_PATS = [
            /^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i, /^(yesterday|today)$/i,
            /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)$/i,
            /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/, /^(วันนี้|เมื่อวาน|จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์)$/,
          ];
          const MONTH_DAY_PAT = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,?\s*\d{4})?$/i;
          const raw = el.innerText || '';
          const tokens = raw.split(/\s+/).map(t => t.trim()).filter(Boolean);
          let label = '';
          for (let i = tokens.length - 1; i >= 0; i--) {
            if (SINGLE_PATS.some(p => p.test(tokens[i]))) { label = tokens[i]; break; }
          }
          if (!label && tokens.length >= 2) {
            for (let i = tokens.length - 2; i >= 0; i--) {
              const pair = tokens[i] + ' ' + tokens[i + 1];
              if (MONTH_DAY_PAT.test(pair)) { label = pair; break; }
            }
          }
          return label;
        }).catch(() => null);

        if (!label) continue;
        const chatDay = dayLabelToDate(label);
        if (chatDay && chatDay.getTime() < dateFrom.getTime()) {
          yesterdayZoneEndScrollPos = await getScrollPos(page);
          console.log(`\n  📅 พบ item เก่ากว่า Yesterday ("${label}") — จุดสิ้นสุดจริงที่ ${yesterdayZoneEndScrollPos}px`);
          foundOlderInExtend = true;
          extendDone = true;
          break;
        }
        if (chatDay && chatDay.getTime() >= dateFrom.getTime() && chatDay.getTime() <= dateTo.getTime()) {
          yesterdayZoneEndScrollPos = await getScrollPos(page);
        }
      }

      if (!extendDone) {
        const scrolled = await scrollChatListDown(page, 3);
        const newPos = await getScrollPos(page);
        if (!scrolled || newPos <= lastExtendScrollPos + 50) {
          extendStuckCount++;
          if (extendStuckCount >= 3) {
            console.log(`\n  🏁 Extend scroll หยุด — จุดสิ้นสุดที่ ${yesterdayZoneEndScrollPos}px`);
            extendDone = true;
          }
        } else {
          extendStuckCount = 0;
        }
        lastExtendScrollPos = newPos;
        await page.waitForTimeout(500);
      }
    }

    console.log(`\n🔄 Phase 2: ประมวลผลจาก Yesterday chat ล่าสุด (scroll ~${yesterdayZoneEndScrollPos}px) เลื่อนขึ้น...`);
    await scrollToPos(page, yesterdayZoneEndScrollPos);
    await page.waitForTimeout(1000);

    // =============================================
    // PHASE 2: PROCESS — scan จากล่างขึ้น, click Yesterday item ล่าสุดก่อน
    // =============================================
    let scrollUpWithoutYesterday = 0;
    const attemptedKeys = new Set(); // dedup ระดับ DOM item — ไม่ click visual item ซ้ำ

    while (!outerDone && !wasCancelled) {
      const n = await page.locator('.list-group-item-chat').count();
      let processedThisRound = false;
      let newKeyThisRound = false;

      // วน item จาก LAST → FIRST หา Yesterday item ที่ยังไม่ได้ process
      for (let i = n - 1; i >= 0 && !outerDone && !wasCancelled; i--) {
        try {
          const item = page.locator('.list-group-item-chat').nth(i);

          const { label, listName, itemKey } = await item.evaluate((el) => {
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
            for (let i = tokens.length - 1; i >= 0; i--) {
              if (SINGLE_PATS.some(p => p.test(tokens[i]))) { label = tokens[i]; break; }
            }
            if (!label && tokens.length >= 2) {
              for (let i = tokens.length - 2; i >= 0; i--) {
                const pair2 = tokens[i] + ' ' + tokens[i + 1];
                const pair3 = i + 2 < tokens.length ? tokens[i] + ' ' + tokens[i+1] + ' ' + tokens[i+2] : '';
                if (MONTH_DAY_PAT.test(pair3)) { label = pair3; break; }
                if (MONTH_DAY_PAT.test(pair2)) { label = pair2; break; }
              }
            }
            if (!label) {
              for (const child of el.querySelectorAll('[datetime],[aria-label],[title]')) {
                const v = (child.getAttribute('datetime') || child.getAttribute('aria-label') || child.getAttribute('title') || '').trim();
                if (v && (SINGLE_PATS.some(p => p.test(v)) || MONTH_DAY_PAT.test(v))) { label = v; break; }
              }
            }
            let listName = null;
            for (const img of el.querySelectorAll('img[alt]')) {
              const alt = img.alt?.trim();
              if (!alt || alt.length < 2 || alt.length >= 50) continue;
              if (!/[฀-๿a-zA-Z0-9]/.test(alt)) continue;
              if (/^(LINE|photo|image|avatar|icon|logo|sticker|emoji|gif|video|audio|file)$/i.test(alt)) continue;
              if (/\b(photo|image|replying|message|sticker|video|audio|file)\b/i.test(alt)) continue;
              if (/hourglass|not.?done|pending|loading|clock|ยังไม่|เสร็จ/i.test(alt)) continue;
              if (alt.split(/\s+/).length > 5) continue;
              listName = alt; break;
            }
            if (!listName) {
              const firstLine = raw.split('\n')[0]?.trim() || '';
              if (firstLine.length >= 2 && firstLine.length < 50 &&
                  (/[฀-๿a-zA-Z]/.test(firstLine) || /\d{6,}/.test(firstLine)) &&
                  !/\b(photo|image|sticker|video|audio|file|ภาพ|วิดีโอ)\b/i.test(firstLine) &&
                  !/^\d{1,2}:\d{2}/.test(firstLine) &&
                  !/^(yesterday|today|เมื่อวาน|วันนี้|mon|tue|wed|thu|fri|sat|sun)/i.test(firstLine) &&
                  !/^\d{1,2}\/\d{1,2}/.test(firstLine)) {
                listName = firstLine;
              }
            }
            // itemKey = ตัวระบุ visual item (ชื่อ + preview 30 ตัวแรก) เพื่อ dedup ไม่ให้ click ซ้ำ
            const itemKey = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50);
            return { label, listName, itemKey };
          }).catch(() => ({ label: null, listName: null, itemKey: null }));

          if (!label) continue;
          const chatDay = dayLabelToDate(label);
          if (!chatDay || chatDay.getTime() > dateTo.getTime() || chatDay.getTime() < dateFrom.getTime()) continue;

          // ข้าม visual item ที่เคยลอง click แล้ว — ป้องกัน ↩ storm (re-click ซ้ำๆ)
          if (itemKey && attemptedKeys.has(itemKey)) continue;
          if (itemKey) { attemptedKeys.add(itemKey); newKeyThisRound = true; }

          // Click item — รอจน customer id (หลัง /chat/) เปลี่ยนเป็นคนใหม่
          // URL format: https://chat.line.biz/<ACCOUNT_ID>/chat/<CUSTOMER_ID>
          const urlBefore = page.url();
          const custIdRE  = /\/chat\/(U[a-f0-9]{32})/i;
          const idBefore  = (urlBefore.match(custIdRE) || [])[1] || '';
          await item.scrollIntoViewIfNeeded().catch(() => {});
          await item.click().catch(() => {});
          try {
            await page.waitForFunction((prev) => {
              const mm = location.href.match(/\/chat\/(U[a-f0-9]{32})/i);
              return mm && mm[1].toLowerCase() !== prev;
            }, idBefore.toLowerCase(), { timeout: 6000 });
          } catch {}
          await page.waitForTimeout(600);

          const url = page.url();
          const m = url.match(custIdRE);
          if (!m) { process.stdout.write('✗'); continue; }
          const lineUserId = m[1];
          // click ไม่เปลี่ยนแชท (ยังเปิดคนเดิม) — ข้ามไป item ถัดไป
          if (lineUserId.toLowerCase() === idBefore.toLowerCase()) { process.stdout.write('✗'); continue; }
          if (processedUrls.has(url) || visitedCustomers.has(lineUserId)) { process.stdout.write('↩'); continue; }
          processedUrls.add(url);

          totalSeen++;
          if (visitedCustomers.size >= CUSTOMER_LIMIT) {
            console.log(`\n🏁 ถึงลิมิต ${LIMIT_LABEL} ลูกค้าแล้ว — หยุด`);
            outerDone = true; break;
          }
          visitedCustomers.add(lineUserId);
          await updateJob(job.id, { total_chats: totalSeen });

          const profile     = await extractCustomerProfile(page);
          const displayName = profile.name || listName || lineUserId.slice(0, 16);
          if (profile.assignedAdmin) console.log(`\n    👤 Assigned: ${profile.assignedAdmin}`);

          const upd = await updateJob(job.id, { current_chat: displayName, logged_count: logged });
          if (upd?.cancelled) {
            console.log('\n🚫 Job ถูกยกเลิกจากเว็บ — หยุด scrape');
            wasCancelled = true; break;
          }

          const abortedLoad = await loadChatHistory(page, dateFrom, async () => {
            const r = await updateJob(job.id, {});
            return r?.cancelled === true;
          });
          if (abortedLoad) {
            console.log('\n🚫 Job ถูกยกเลิกระหว่าง loadChatHistory — หยุด scrape');
            wasCancelled = true; break;
          }

          // เก็บข้อความทั้งหมดโดย scroll ไล่ลง (แก้ virtual scroll ทำข้อความหาย)
          const msgs = await collectAllMessages(page, dateFrom, dateTo, async () => {
            const r = await updateJob(job.id, {});
            return r?.cancelled === true;
          });
          for (const msg of msgs) {
            if (!msg.timestamp) {
              const d = new Date(dateFrom);
              d.setHours(12, 0, 0, 0);
              msg.timestamp = d.toISOString();
            }
          }

          const notesList = await extractNotes(page);

          if (!msgs.length && !notesList.length) {
            const dbg = await page.evaluate(() => {
              const dates  = Array.from(document.querySelectorAll('.chatsys-date')).map(d => d.innerText?.trim()).filter(Boolean);
              const admins = document.querySelectorAll('.chat.chat-reverse').length;
              const all    = document.querySelectorAll('.chat').length;
              return { dates: dates.slice(0, 3), admins, all };
            }).catch(() => ({}));
            process.stdout.write(`\n  . ${displayName.slice(0,20)} [lbl:${label}|d:${(dbg.dates||[]).join('|')},adm:${dbg.admins}/${dbg.all}]`);
            processedThisRound = true;
            break;
          }

          await saveScreenshot(page, `02_chat_${visitedCustomers.size}_${lineUserId.slice(0, 8)}`);
          console.log(`\n  [${visitedCustomers.size}/${LIMIT_LABEL}] "${displayName}" (${lineUserId.slice(0, 8)}): ${msgs.length} ข้อความ, ${notesList.length} note`);

          for (const msg of msgs) {
            if (wasCancelled) break;
            const r = await postReply(lineUserId, msg.text, msg.adminName, msg.customerText, msg.timestamp, msg.customerTs, displayName, profile, msg.messageType);
            if (r?.ok) {
              console.log(`    ✅ score ${r.qc?.finalScore ?? 'no-cust'} (${msg.adminName || 'ไม่รู้ชื่อ'}) "${msg.text.slice(0, 40)}"${msg.customerText ? ` | ❓"${msg.customerText.slice(0, 30)}"` : ''}`);
              logged++;
            } else {
              console.log(`    ⚠️ [${r?.error}] "${msg.text.slice(0, 40)}"`);
            }
            const chk = await updateJob(job.id, { logged_count: logged });
            if (chk?.cancelled) { wasCancelled = true; break; }
          }

          for (const note of notesList) {
            if (wasCancelled) break;
            const r = await postNote(lineUserId, note.note_text, parseNotedAt(note.noted_at), note.noted_by);
            if (r?.ok && r.inserted) {
              console.log(`    📝 Note บันทึก: "${note.note_text.slice(0, 50)}" (${note.noted_by || '?'} @ ${note.noted_at || '?'})`);
              notes_saved++;
            }
          }

          if (wasCancelled) { console.log('\n🚫 Job ถูกยกเลิกระหว่างส่งข้อมูล — หยุด scrape'); break; }

          processedThisRound = true;
          break; // ประมวลผล 1 item แล้ว restart outer loop หา item ต่อไปจากล่าง
        } catch (e) {
          console.log(`\n  ⚠️ item ${i}: ${e.message}`);
        }
      } // end inner for (Phase 2)

      if (outerDone || wasCancelled) break;

      // ถ้า process ได้ → reset counter, วนต่อ (ยังมี Yesterday ใน viewport เดิม)
      // ถ้าไม่ได้ process แต่ยังเจอ key ใหม่ → วนต่อโดยไม่ scroll (ลอง item อื่นใน viewport)
      // ถ้าไม่เจอ key ใหม่เลย → viewport นี้ลองครบแล้ว เลื่อนขึ้น
      if (processedThisRound) {
        scrollUpWithoutYesterday = 0;
      } else if (!newKeyThisRound) {
        scrollUpWithoutYesterday++;
        const curPos = await getScrollPos(page);
        if (scrollUpWithoutYesterday >= 30 || curPos <= 50) {
          console.log(`\n  🏁 เลื่อนขึ้นสุด/ครบแล้ว (pos=${curPos}, รอบ=${scrollUpWithoutYesterday}) — จบ Phase 2`);
          break;
        }
        const scrolledUp = await scrollChatListUp(page, 1);
        await page.waitForTimeout(600);
        const newPos = await getScrollPos(page);
        if (!scrolledUp || newPos >= curPos - 20) {
          // เลื่อนขึ้นไม่ได้แล้ว — ถ้าทำซ้ำหลายรอบให้หยุด
          if (scrollUpWithoutYesterday >= 5) { console.log('\n  🏁 เลื่อนขึ้นสุดแล้ว — จบ Phase 2'); break; }
        }
      }
    } // end Phase 2 while

    if (wasCancelled) {
      console.log(`\n🚫 ยกเลิกแล้ว — บันทึก QC ${logged} ข้อความ, ${notes_saved} notes`);
    } else {
      await updateJob(job.id, { status: 'done', logged_count: logged, current_chat: null });
      console.log(`\n✅ เสร็จ — บันทึก QC ${logged} ข้อความ, ${notes_saved} notes`);
    }
  } catch (err) {
    await updateJob(job.id, { status: 'error', error_text: err.message });
    await saveScreenshot(page, '99_error').catch(() => {});
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
  console.log(`👥 Limit: ${LIMIT_LABEL === 'ทั้งหมด' ? 'ทั้งหมดของ Yesterday' : LIMIT_LABEL + ' ลูกค้า'}`);
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

// scraper-core — logic ล้วน (ไม่มี browser) ใช้ร่วมกันระหว่าง scraper.js และ tests
//   - dayLabelToDate : แปลง label วันใน chat list (Today/Yesterday/weekday/รูปแบบวันที่) → Date
//   - parseChatHTML  : แยก bubble customer/admin + date separator จาก HTML ของ chat panel
//   - pairMessages   : จับคู่ customer↔admin สำหรับ QC (รวม bubble admin ภายใน 90s / รวมคำถามลูกค้าต่อเนื่อง)
//   - hashText / dedupKey / qcPairKey : กันข้อมูลซ้ำ
// CommonJS — ใช้ได้ทั้ง node script (require) และ Next.js (import)
const crypto = require("crypto");

const DAY_MAP = {
  sunday: 0,
  sun: 0,
  อาทิตย์: 0,
  monday: 1,
  mon: 1,
  จันทร์: 1,
  tuesday: 2,
  tue: 2,
  อังคาร: 2,
  wednesday: 3,
  wed: 3,
  พุธ: 3,
  thursday: 4,
  thu: 4,
  พฤหัสบดี: 4,
  พฤหัส: 4,
  friday: 5,
  fri: 5,
  ศุกร์: 5,
  saturday: 6,
  sat: 6,
  เสาร์: 6,
};
const MONTHS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

// แปลง label วันใน chat list → Date (เที่ยงคืนของวันนั้น). now ใส่ได้เพื่อทดสอบให้ผลคงที่
function dayLabelToDate(label, now = new Date()) {
  if (!label) return null;
  const s = String(label).trim();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // HH:MM → วันนี้ (LINE แสดงเวลาแทนวันสำหรับแชทวันนี้)
  if (/^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i.test(s)) return new Date(today);

  const sl = s.toLowerCase();
  if (sl === "today" || sl === "วันนี้") return new Date(today);
  if (sl === "yesterday" || sl === "เมื่อวาน") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d;
  }

  // "Thu, Jun 4" / "Wed, Jul 1" (date separator ของ LINE OA) — ตัดชื่อวันหน้า+จุลภาค
  //   ต้องทำก่อน loop ชื่อวัน (ไม่งั้น "thu" ใน "thu, jun 4" ถูกจับเป็นวันพฤหัส)
  const wd = s.match(
    /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,\s*(.+)$/i,
  );
  const core = wd ? wd[1].trim() : s;
  const coreLower = core.toLowerCase();

  // ชื่อวันเดี่ยว (TH/EN) → วันล่าสุดในอดีตที่ตรงกับวันนั้น  (เฉพาะกรณีไม่มีเดือน/วันตามหลัง)
  if (!wd) {
    for (const [name, dayNum] of Object.entries(DAY_MAP)) {
      if (coreLower === name || coreLower.includes(name)) {
        const d = new Date(today);
        let diff = (d.getDay() - dayNum + 7) % 7;
        if (diff === 0) diff = 7; // ชื่อเดียวกับวันนี้ = สัปดาห์ก่อน
        d.setDate(d.getDate() - diff);
        return d;
      }
    }
  }

  // "May 20" / "May 20, 2026" / "Jun 4" (หลังตัดชื่อวันออกแล้ว)
  const md = core.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:[,\s]+(\d{4}))?$/i,
  );
  if (md) {
    const mo = MONTHS[md[1].toLowerCase()];
    const yr = md[3] ? parseInt(md[3]) : today.getFullYear();
    const d = new Date(yr, mo, parseInt(md[2]));
    if (!md[3] && d.getTime() > today.getTime()) d.setFullYear(yr - 1);
    return d;
  }

  // ISO 2026-05-13
  const iso = core.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso)
    return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));

  // M/D/YYYY หรือ D/M/YYYY หรือ M/D  (ตัวเลข > 12 = วัน)
  const num = core.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (num) {
    const a = parseInt(num[1]);
    const b = parseInt(num[2]);
    const yr = num[3]
      ? parseInt(num[3]) > 100
        ? parseInt(num[3])
        : 2000 + parseInt(num[3])
      : today.getFullYear();
    if (b > 12) return new Date(yr, a - 1, b); // a=month, b=day
    if (a > 12) return new Date(yr, b - 1, a); // a=day, b=month (D/M)
    return new Date(yr, a - 1, b); // ค่าเริ่มต้น M/D (LINE OA EN locale)
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

// label เป็นวันที่อยู่ในช่วง [from, to] ไหม (ใช้ตัดสินใจ scroll chat list)
function labelInRange(label, fromDate, toDate, now = new Date()) {
  const d = dayLabelToDate(label, now);
  if (!d) return null; // ตัดสินใจไม่ได้
  const t = d.getTime();
  return (
    t >= new Date(fromDate).setHours(0, 0, 0, 0) &&
    t <= new Date(toDate).setHours(23, 59, 59, 999)
  );
}

// label = แชทที่ active ตั้งแต่ fromDate เป็นต้นมา (รวมแชทที่ active วันนี้ ซึ่งอาจมีประวัติของ fromDate)
//   ใช้ scan ให้ครอบแชทที่ "ยังมีข้อความของวันเป้าหมายอยู่ใน history" แล้วค่อยกรอง message ทีหลัง
function labelOnOrAfter(label, fromDate, now = new Date()) {
  const d = dayLabelToDate(label, now);
  if (!d) return null;
  return d.getTime() >= new Date(fromDate).setHours(0, 0, 0, 0);
}

// resolve label ของ chat list → "YYYY-MM-DD" (วันตามหน้าจอ LINE OA) หรือ null ถ้าตัดสินไม่ได้
function resolveLabelDay(label, now = new Date()) {
  const d = dayLabelToDate(label, now);
  if (!d) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

// จัดกลุ่ม chat ตามวันที่ (resolve จาก label) เทียบช่วงเป้าหมาย [fromDate, toDate]
//   target  : from <= day <= to   (ตรงวันที่เลือก → เปิด)
//   too_new : day > to            (ใหม่กว่า/วันนี้ → strict: ข้าม, ไม่เปิด)
//   too_old : day < from          (เก่ากว่า → ขอบล่าง หยุด scroll)
//   unknown : label ตัดสินไม่ได้   (strict: ข้าม; deep: เปิดเพื่อความปลอดภัย)
function classifyCandidate(label, fromDate, toDate, now = new Date()) {
  const day = resolveLabelDay(label, now);
  if (!day) return "unknown";
  const from = String(fromDate).slice(0, 10);
  const to = String(toDate || fromDate).slice(0, 10);
  if (day < from) return "too_old";
  if (day > to) return "too_new";
  return "target";
}

// สร้าง external_chat_key ที่ "คงที่ทุกครั้งที่รัน" สำหรับแชทที่ไม่มี LINE user id
//   ลำดับความสำคัญ: chatId จาก URL/DOM (ถ้ามี) → hash(account + ชื่อลูกค้า normalize)
//   ไม่ใช้ค่าสุ่ม — rerun ต้องได้ key เดิม เพื่อ map เข้า customer/conversation เดิม
function buildExternalChatKey({ accountId, chatId, name } = {}) {
  const acct = String(accountId || "oa").trim();
  if (chatId) return `chat:${acct}:${String(chatId).trim()}`;
  const norm = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return `scraper:${hashText(acct + "|" + norm)}`;
}

// created_at อยู่ในช่วงวันที่เป้าหมายไหม (กรอง message ให้เหลือเฉพาะวันที่ scrape)
function inDateWindow(created_at, fromDate, toDate) {
  if (!created_at) return false;
  const t = new Date(created_at).getTime();
  return (
    t >= new Date(fromDate).setHours(0, 0, 0, 0) &&
    t <= new Date(toDate).setHours(23, 59, 59, 999)
  );
}

function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// แยกข้อความจาก HTML ของ chat panel — มิเรอร์ class จริงของ LINE OA Manager
//   date separator = .chatsys-date ; bubble = .chat ; admin (ขวา) = .chat chat-reverse
//   ข้อความ = .chat-item-text ; เวลา = span ที่เป็น HH:MM ; ชื่อ admin = img[alt]
//   type = data-mtype หรือ marker [sticker]/[image]/[file] หรือ <img src*=sticker>
function parseChatHTML(html, opts = {}) {
  const now = opts.now || new Date();
  const out = [];
  const failures = opts.failures; // อาเรย์ (ถ้าส่งมา) เก็บ raw HTML ของ bubble ที่ parse ไม่ได้ เพื่อแก้ selector
  // หา marker เปิดของ date separator และ bubble ตามลำดับเอกสาร
  //   real LINE OA: date separator = class="chatsys chatsys-date ..." (ขึ้นต้นด้วย "chatsys ")
  //   bubble = class="chat ..." / "chat chat-reverse ..." (ขึ้นต้นด้วย "chat ")
  //   ต้องจับ chatsys ด้วย ไม่งั้น currentDate = null → ข้อความทั้งหมดถูก stamp เป็น "วันนี้" (บั๊ก)
  const markerRe =
    /<div\b[^>]*\bclass="((?:chatsys-date|chatsys|chat-reverse|chat)(?=[ "])[^"]*)"[^>]*>/gi;
  const markers = [];
  let m;
  while ((m = markerRe.exec(html)))
    markers.push({
      index: m.index,
      end: markerRe.lastIndex,
      cls: m[1],
      open: m[0],
    });

  let currentDate = null;
  let lastAdminName = null; // carry-forward — LINE OA แสดงชื่อ admin ครั้งเดียวต่อ sequence
  for (let i = 0; i < markers.length; i++) {
    const seg = html.slice(
      markers[i].end,
      i + 1 < markers.length ? markers[i + 1].index : html.length,
    );
    const cls = markers[i].cls;

    if (/\bchatsys-date\b/.test(cls)) {
      // date separator: ข้อความมักเป็น "Thu, Jun 4" — เอาเฉพาะช่วงก่อน nested div (v-portal)
      const rawFull = stripTags(seg.split(/<div\b/i)[0] || seg);
      if (rawFull) currentDate = dayLabelToDate(rawFull, now) || currentDate;
      continue;
    }
    // chatsys อื่น ๆ (chatsys-content = ข้อความระบบ/แจ้งเตือน) — ไม่ใช่ bubble ลูกค้า/แอดมิน → ข้าม
    if (/\bchatsys\b/.test(cls)) continue;

    const direction = /\bchat-reverse\b/.test(cls) ? "admin" : "customer";

    // ชนิดข้อความ
    let message_type = "text";
    const typeAttr = (markers[i].open.match(/data-mtype="([^"]+)"/) || [])[1];
    if (typeAttr) message_type = typeAttr;
    else if (
      /<img[^>]+src="[^"]*sticker/i.test(seg) ||
      /\[sticker\]/i.test(seg)
    )
      message_type = "sticker";
    else if (
      /\[image\]/i.test(seg) ||
      /<img[^>]+class="[^"]*(photo|image)/i.test(seg)
    )
      message_type = "image";
    else if (/\[file\]/i.test(seg) || /download/i.test(seg))
      message_type = "file";
    else if (/<(audio|video)\b/i.test(seg)) message_type = "media";

    // ข้อความ
    const textM = seg.match(
      /class="[^"]*\bchat-item-text\b[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|p)>/i,
    );
    let text = textM ? stripTags(textM[1]) : "";
    if (!text && message_type !== "text") text = `[${message_type}]`;

    // เวลา HH:MM (เอาตัวท้ายสุด — เวลาส่งอยู่ท้าย bubble)
    let time = null;
    const times = seg.match(
      />\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s*</gi,
    );
    if (times) {
      const last = times[times.length - 1].match(
        /(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i,
      );
      time = last ? last[1] : null;
    }

    // ชื่อ admin — หลายกลยุทธ์ + carry-forward (real LINE OA ซ่อนชื่อหลัง bubble แรก)
    //   admin จริงขึ้นต้น PK เสมอ → หา PK-name ใน header (ลบ message text ออกก่อน กันชนกับเนื้อหา)
    let admin_name = null;
    if (direction === "admin") {
      const valid = (s) =>
        s &&
        s.trim().length >= 2 &&
        s.trim().length < 50 &&
        /[฀-๿a-zA-Z]/.test(s) &&
        !/^(photo|image|avatar|icon|sticker|read|seen|delivered|sent|อ่านแล้ว|ส่งแล้ว)$/i.test(
          s.trim(),
        );
      const segNoText = seg.replace(
        /class="[^"]*\bchat-item-text\b[^"]*"[^>]*>[\s\S]*?<\/(?:div|span|p)>/gi,
        "",
      );
      const alt = (seg.match(/<img[^>]+alt="([^"]+)"/i) || [])[1];
      const titleAttr = (segNoText.match(/(?:title|aria-label)="([^"]+)"/i) ||
        [])[1];
      const pkName = (segNoText.match(
        /((?:ᴘᴋ|🅿🅺|🅿️🅺|PK|pk|Pk)[ \-_·.][^\n<>"]{0,25})/,
      ) || [])[1];
      admin_name =
        [alt, pkName, titleAttr].find(valid)?.trim() || lastAdminName;
      if (admin_name) lastAdminName = admin_name;
    }

    const created_at = time ? timeOnDate(time, currentDate || now) : null;
    if (!text) {
      // bubble ที่ดึงข้อความไม่ได้ → เก็บ raw HTML ไว้แก้ selector (ไม่เดา)
      if (failures)
        failures.push({
          reason: "no_text",
          direction,
          html: (markers[i].open + seg).slice(0, 500),
        });
      continue;
    }
    if (!created_at && failures)
      failures.push({
        reason: "no_created_at",
        direction,
        text: text.slice(0, 60),
        html: (markers[i].open + seg).slice(0, 500),
      });
    out.push({
      direction,
      message_text: text,
      message_type,
      time,
      created_at,
      admin_name,
      raw_text: stripTags(seg).slice(0, 500),
      // locator metadata — ใช้หา bubble เดิมใน DOM ตอน capture หลักฐาน (ห้าม match ด้วย text อย่างเดียว)
      dom_index: i, // ลำดับ marker ในเอกสาร
      timestamp_text: time || null,
      date_separator: currentDate ? new Date(currentDate).toISOString().slice(0, 10) : null,
    });
  }
  return out;
}

// สรุปคุณภาพการ parse ของ 1 แชท — ใช้ทั้ง dry-run และ audit
function summarizeChat({
  chatIndex,
  customerName,
  dateLabel,
  messages,
  pairs,
  dupSkipped = 0,
  notesCount = 0,
}) {
  const KNOWN_TYPES = ["text", "image", "sticker", "file", "media"];
  const admin = messages.filter((m) => m.direction === "admin");
  const customer = messages.filter((m) => m.direction === "customer");
  return {
    chat_index: chatIndex,
    customer_name: customerName,
    detected_date_label: dateLabel || null,
    date_label_parsed: dateLabel ? dayLabelToDate(dateLabel) !== null : null,
    message_count: messages.length,
    admin_message_count: admin.length,
    customer_message_count: customer.length,
    missing_created_at: messages.filter((m) => !m.created_at).length,
    missing_direction: messages.filter(
      (m) => m.direction !== "admin" && m.direction !== "customer",
    ).length,
    unknown_message_type: messages.filter(
      (m) => !KNOWN_TYPES.includes(m.message_type),
    ).length,
    admin_without_customer_pair: pairs.filter((p) => !p.customer_text).length,
    pairs: pairs.length,
    duplicates: dupSkipped,
    notes_count: notesCount,
  };
}

// รวม HH:MM กับวันที่ → ISO timestamp
function timeOnDate(time, dateObj) {
  const p = String(time).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i);
  if (!p) return null;
  let h = parseInt(p[1]);
  const mi = parseInt(p[2]);
  const se = p[3] ? parseInt(p[3]) : 0;
  if (p[4]) {
    if (/pm/i.test(p[4]) && h < 12) h += 12;
    if (/am/i.test(p[4]) && h === 12) h = 0;
  }
  const d = new Date(dateObj);
  d.setHours(h, mi, se, 0);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const normalizeText = (s) =>
  String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const hashText = (s) =>
  crypto.createHash("sha1").update(normalizeText(s)).digest("hex").slice(0, 16);

// dedup key ระดับ message: line_user_id + direction + hash(text) + created_at
const messageDedupKey = ({
  line_user_id,
  direction,
  message_text,
  created_at,
}) =>
  `${line_user_id || ""}|${direction}|${hashText(message_text)}|${created_at || ""}`;

// dedup key ระดับคู่ QC: line_user_id + customer_created_at + admin_created_at + hash(admin_text)
const qcPairKey = ({
  line_user_id,
  customer_created_at,
  admin_created_at,
  admin_text,
}) =>
  `${line_user_id || ""}|${customer_created_at || ""}|${admin_created_at || ""}|${hashText(admin_text)}`;

// จับคู่ customer↔admin สำหรับ QC
//   - รวมข้อความลูกค้าต่อเนื่องก่อน admin ตอบ → customer_text เดียว (เรียงเวลา)
//   - รวม bubble admin ที่ห่างกัน ≤ groupWindowSec → reply เดียว (reply_group_id เดียว)
//   - system message ถูกข้าม
function pairMessages(messages, opts = {}) {
  const win = (opts.groupWindowSec ?? 90) * 1000;
  const sorted = messages
    .filter((m) => m.direction === "customer" || m.direction === "admin")
    .map((m, i) => ({ ...m, _i: i }))
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : a._i;
      const tb = b.created_at ? new Date(b.created_at).getTime() : b._i;
      return ta - tb || a._i - b._i;
    });

  const pairs = [];
  let pendingCust = [];
  let lastCustomer = null; // ลูกค้าคนล่าสุดที่เคยถาม (context ของ admin follow-up หลังตอบไปแล้ว)
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur.direction === "customer") {
      pendingCust.push(cur);
      lastCustomer = cur;
      continue;
    }
    // admin — รวม bubble ต่อเนื่องภายใน window
    const group = [cur];
    while (i + 1 < sorted.length && sorted[i + 1].direction === "admin") {
      const prev = group[group.length - 1];
      const next = sorted[i + 1];
      const dt =
        prev.created_at && next.created_at
          ? new Date(next.created_at) - new Date(prev.created_at)
          : 0;
      if (dt <= win) {
        group.push(next);
        i++;
      } else break;
    }
    const admin_text = group.map((g) => g.message_text).join("\n");
    const admin_created_at = group[0].created_at || null;
    const admin_name = group.map((g) => g.admin_name).find(Boolean) || null;

    // คำถามลูกค้า: ใช้คำถามใหม่ที่ยังไม่ตอบ (fresh) ก่อน; ถ้าไม่มี = admin follow-up
    //   → carry คำถามล่าสุดเป็น context (กัน "admin ไม่มีคู่") แต่ไม่คิด response_seconds (ไม่ใช่การตอบใหม่)
    const fresh = pendingCust.length > 0;
    const custMsgs = fresh ? pendingCust : lastCustomer ? [lastCustomer] : [];
    const customer_text = custMsgs.length
      ? custMsgs.map((c) => c.message_text).join("\n")
      : null;
    const customer_created_at = fresh
      ? pendingCust[pendingCust.length - 1].created_at || null
      : null;
    let response_seconds = null;
    if (fresh && customer_created_at && admin_created_at)
      response_seconds = Math.max(
        0,
        Math.round(
          (new Date(admin_created_at) - new Date(customer_created_at)) / 1000,
        ),
      );
    pairs.push({
      customer_text,
      customer_created_at,
      admin_text,
      admin_created_at,
      admin_name,
      response_seconds,
      is_followup: !fresh && !!customer_text, // admin ตอบต่อเนื่องคำถามเดิม
      message_type: group[group.length - 1].message_type || "text",
      reply_group_id: hashText(
        group.map((g) => g.message_text + (g.created_at || "")).join("|"),
      ),
      // อ้างอิง bubble ต้นทางทุกใบของคู่นี้ — ใช้เก็บ message ids/keys บน qc_score
      //   (block ลูกค้าหลายข้อความ / admin หลาย bubble ต้องรู้ครบทุกใบ)
      customer_items: custMsgs.slice(),
      admin_items: group.slice(),
    });
    pendingCust = [];
  }
  return pairs;
}

// source_message_key — กุญแจระบุ bubble ต้นทางแบบ deterministic (ห้ามระบุด้วย text อย่างเดียว)
//   sha256(chatKey | direction | created_at | normalizedText | messageType) → 32 hex
function sourceMessageKey({ chatKey, direction, created_at, text, message_type } = {}) {
  const crypto = require("crypto");
  const norm = normalizeText(text || "");
  const raw = [
    String(chatKey || ""),
    String(direction || ""),
    created_at ? new Date(created_at).toISOString() : "",
    norm,
    String(message_type || "text"),
  ].join("|");
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 32);
}

// dedup messages — คืน { unique, skipped_duplicate }
function dedupMessages(messages, lineUserId) {
  const seen = new Set();
  const unique = [];
  let skipped_duplicate = 0;
  for (const msg of messages) {
    const key = messageDedupKey({
      ...msg,
      line_user_id: msg.line_user_id || lineUserId,
    });
    if (seen.has(key)) {
      skipped_duplicate++;
      continue;
    }
    seen.add(key);
    unique.push(msg);
  }
  return { unique, skipped_duplicate };
}

// สร้าง payload สำหรับ POST /api/admin/log-reply
function buildLogReplyPayload(pair, ctx = {}) {
  return {
    line_user_id: ctx.line_user_id || null,
    customer_name: ctx.customer_name || null,
    customer_text: pair.customer_text,
    customer_created_at: pair.customer_created_at,
    customer_ts: pair.customer_created_at, // alias ที่ route เดิมใช้
    admin_name: pair.admin_name,
    admin_text: pair.admin_text,
    text: pair.admin_text, // alias ที่ route เดิมใช้
    admin_created_at: pair.admin_created_at,
    admin_ts: pair.admin_created_at, // alias ที่ route เดิมใช้
    response_seconds: pair.response_seconds,
    message_type: pair.message_type,
    reply_group_id: pair.reply_group_id,
    assigned_admin: ctx.assigned_admin || null,
    phone: ctx.phone || null,
    email: ctx.email || null,
    source: "scraper",
    scrape_source: "line_oa_manager",
    raw: ctx.raw || null,
  };
}

module.exports = {
  dayLabelToDate,
  labelInRange,
  parseChatHTML,
  timeOnDate,
  normalizeText,
  hashText,
  messageDedupKey,
  qcPairKey,
  pairMessages,
  dedupMessages,
  buildLogReplyPayload,
  summarizeChat,
  labelOnOrAfter,
  resolveLabelDay,
  classifyCandidate,
  buildExternalChatKey,
  sourceMessageKey,
  inDateWindow,
  DAY_MAP,
};

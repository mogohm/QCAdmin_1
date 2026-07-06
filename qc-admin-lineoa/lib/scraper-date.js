// scraper-date.js — วันที่/ช่วงเวลา แบบ Asia/Bangkok (UTC+7, ไม่มี DST)
//   ใช้ร่วมทั้ง job API (ESM), scraper.js (CJS), และ test — จึงเขียนเป็น CommonJS
//   กฎธุรกิจ: "วันนี้" ห้ามเก็บ (แอดมินยังทำงานอยู่) — เก็บได้เฉพาะเมื่อวานหรือก่อนหน้า
const TZ_OFFSET_MS = 7 * 3600 * 1000; // +07:00
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// วัน (เวลาไทย) ของ epoch ที่กำหนด + เลื่อนวัน → "YYYY-MM-DD"  (testable, ไม่ผูกกับ Date.now)
function bangkokDayAt(epochMs, offsetDays = 0) {
  return new Date(epochMs + TZ_OFFSET_MS + offsetDays * 86400000)
    .toISOString()
    .slice(0, 10);
}

// วันที่ปัจจุบันตามเวลาไทย → "YYYY-MM-DD"
function bangkokToday() {
  return bangkokDayAt(Date.now(), 0);
}

// เมื่อวาน (ตามเวลาไทย) → "YYYY-MM-DD"
function bangkokYesterday() {
  return bangkokDayAt(Date.now(), -1);
}

// แปลงค่า (Date/timestamp/สตริง) → "YYYY-MM-DD" ตามเวลาไทย
function normalizeJobDate(d) {
  if (d == null) return null;
  if (typeof d === "string" && DATE_RE.test(d.trim())) return d.trim();
  const t = new Date(d);
  if (isNaN(t.getTime())) return null;
  return new Date(t.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

// ต้นวัน (เวลาไทย) เป็น UTC timestamp (ms)
function startOfBangkokDay(dateStr) {
  const s = normalizeJobDate(dateStr);
  return Date.parse(`${s}T00:00:00.000+07:00`);
}
// ปลายวัน (เวลาไทย) เป็น UTC timestamp (ms)
function endOfBangkokDay(dateStr) {
  const s = normalizeJobDate(dateStr);
  return Date.parse(`${s}T23:59:59.999+07:00`);
}

// วันที่นี้อยู่ก่อน "วันนี้" (เวลาไทย) ไหม
function isBeforeTodayBangkok(dateStr) {
  const s = normalizeJobDate(dateStr);
  return !!s && s < bangkokToday();
}

// วัน (เวลาไทย) ของ created_at → "YYYY-MM-DD"
function bangkokDayOf(created_at) {
  if (!created_at) return null;
  const t = new Date(created_at);
  if (isNaN(t.getTime())) return null;
  return new Date(t.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

// ข้อความอยู่ในช่วงวันเป้าหมายไหม (เทียบวันตามเวลาไทย — กัน today รั่วเข้ามา)
function messageInTargetRange(created_at, fromDate, toDate) {
  const d = bangkokDayOf(created_at);
  if (!d) return false;
  const from = normalizeJobDate(fromDate);
  const to = normalizeJobDate(toDate || fromDate);
  return d >= from && d <= to;
}

// ตรวจช่วงวันสำหรับสร้าง job — คืน { ok, error?, from, to, timezone }
function validateScrapeRange(from, to) {
  const f = normalizeJobDate(from);
  const t = normalizeJobDate(to || from);
  if (!f || !t)
    return { ok: false, error: "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)" };
  if (f > t)
    return { ok: false, error: "date_from ต้องไม่มากกว่า date_to" };
  const today = bangkokToday();
  // date_to ต้องน้อยกว่าวันนี้ (เวลาไทย) — ห้ามเก็บวันนี้/อนาคต
  if (t >= today)
    return {
      ok: false,
      error:
        "ไม่สามารถเก็บข้อมูลของวันนี้ได้ เนื่องจากแอดมินยังอยู่ระหว่างปฏิบัติงาน กรุณาเลือกเมื่อวานหรือวันที่ก่อนหน้า",
    };
  return { ok: true, from: f, to: t, timezone: "Asia/Bangkok" };
}

module.exports = {
  TZ_OFFSET_MS,
  bangkokDayAt,
  bangkokToday,
  bangkokYesterday,
  normalizeJobDate,
  startOfBangkokDay,
  endOfBangkokDay,
  isBeforeTodayBangkok,
  bangkokDayOf,
  messageInTargetRange,
  validateScrapeRange,
};

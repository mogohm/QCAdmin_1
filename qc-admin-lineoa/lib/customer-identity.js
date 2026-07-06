// ============================================================
// lib/customer-identity.js — ยืนยัน "ชื่อลูกค้า" ต้องไม่ใช่ข้อความแชท/ข้อความระบบ
// ------------------------------------------------------------
//   ปัญหา: customer_name ถูก set เป็นข้อความสนทนา/ข้อความระบบ (เช่น "ขณะนี้ระบบฝาก-ถอน...ปิดให้บริการ")
//   หลักการ: ชื่อลูกค้าต้องสั้น ไม่เป็นประโยค ไม่ใช่ข้อความบริการ ไม่มีขึ้นบรรทัดใหม่
//   ใช้ทั้ง scraper.js (CJS) และ API routes (ESM import default/named)
//   ลำดับความสำคัญของชื่อ: chatList → chatHeader → LINE profile → existing → "ไม่ทราบชื่อลูกค้า"
// ============================================================
const UNKNOWN = "ไม่ทราบชื่อลูกค้า";
const MAX_NAME_LEN = 80;

// วลีข้อความบริการ/ระบบที่พบบ่อย — ถ้าชื่อมีคำเหล่านี้ = ไม่ใช่ชื่อ
const SERVICE_PHRASES = [
  "ระบบฝาก",
  "ฝาก-ถอน",
  "ปิดให้บริการ",
  "ขอบคุณที่ใช้บริการ",
  "กรุณา",
  "แจ้งยืนยัน",
  "ตรวจสอบแล้ว",
  "ทำรายการ",
  "สอบถาม",
  "ยินดีให้บริการ",
  "ขออภัย",
  "รบกวน",
  "ติดต่อ",
  "โปรโมชั่น",
  "เครดิต",
  "ถอนเงิน",
  "ฝากเงิน",
];

function normalizeCustomerName(value) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

// ดูเหมือน "ข้อความแชท/ประโยค" ไม่ใช่ชื่อ
//   *เน้น precision* — ชื่อ LINE ที่ผู้ใช้ตั้งเองมี !/。/เว้นวรรคแปลก ๆ ได้ (เช่น "BANK。888",
//   "7OP!!", "R Y A N K I K", "天不给…") ห้าม flag ชื่อจริงพวกนี้ (เคยทำข้อมูลจริงโดน false positive)
function isLikelyMessageText(value) {
  const s = String(value ?? "");
  if (!s.trim()) return false;
  if (s.includes("\n")) return true; // ชื่อไม่มีหลายบรรทัด
  const norm = normalizeCustomerName(s);
  if (norm.length > MAX_NAME_LEN) return true; // ยาวเกินชื่อ
  const low = norm.toLowerCase();
  if (SERVICE_PHRASES.some((p) => norm.includes(p))) return true; // วลีบริการ
  // ประโยคไทยลงท้ายสุภาพ = ข้อความ (จ้า/ค่า ไม่นับ — ชื่อเล่นไทยลงท้าย "จ้า" พบบ่อย)
  if (/(ครับ|ค่ะ|คะ|นะคะ)\s*$/.test(norm) && norm.length > 12) return true;
  // เครื่องหมายคำถาม = ประโยคถาม (! และ 。ไม่นับ — พบในชื่อจริงบ่อย)
  if (/[?？]/.test(norm)) return true;
  if (/https?:\/\//i.test(low)) return true;
  return false;
}

// เป็นชื่อลูกค้าที่ใช้ได้ไหม
function isValidCustomerDisplayName(value) {
  const norm = normalizeCustomerName(value);
  if (!norm) return false;
  if (norm === UNKNOWN) return false;
  if (norm.length > MAX_NAME_LEN) return false;
  if (isLikelyMessageText(norm)) return false;
  return true;
}

// เลือกชื่อลูกค้าตามลำดับความสำคัญ — คืน "ไม่ทราบชื่อลูกค้า" ถ้าไม่มีชื่อที่ใช้ได้
//   ห้ามใช้ customer_text / admin_text / document.title / ข้อความ preview เป็นแหล่งชื่อ
function resolveCustomerIdentity({
  chatListName,
  chatHeaderName,
  lineProfileName,
  existingName,
  lineUserId,
  externalChatKey,
} = {}) {
  for (const cand of [chatListName, chatHeaderName, lineProfileName, existingName]) {
    if (isValidCustomerDisplayName(cand)) return normalizeCustomerName(cand);
  }
  return UNKNOWN;
}

// sanitize ค่าเดียว: คืนชื่อถ้าใช้ได้, ไม่งั้น null (ให้ผู้เรียกตัดสินใจ fallback)
function sanitizeCustomerName(value) {
  return isValidCustomerDisplayName(value) ? normalizeCustomerName(value) : null;
}

// รหัสเคสอ่านง่าย QC-YYYYMMDD-XXXXXX — เสถียร (id เดิม→ref เดิม) และแยกกันต่อเคส
function shortHash(s) {
  let h = 2166136261 >>> 0;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).toUpperCase().slice(0, 6).padStart(6, "0");
}
function deriveCaseRef({ sourceId, createdAt } = {}) {
  const h = shortHash(sourceId);
  if (createdAt) {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) {
      const b = new Date(d.getTime() + 7 * 3600000); // เวลาไทย
      const ymd = `${b.getUTCFullYear()}${String(b.getUTCMonth() + 1).padStart(2, "0")}${String(b.getUTCDate()).padStart(2, "0")}`;
      return `QC-${ymd}-${h}`;
    }
  }
  return `QC-${h}`;
}

module.exports = {
  UNKNOWN,
  MAX_NAME_LEN,
  normalizeCustomerName,
  isLikelyMessageText,
  isValidCustomerDisplayName,
  resolveCustomerIdentity,
  sanitizeCustomerName,
  deriveCaseRef,
};

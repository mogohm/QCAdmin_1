// ============================================================
// lib/db-id.js — ตรวจ/แปลงชนิด id ให้ตรงกับคอลัมน์จริง ก่อนยิง SQL
// ------------------------------------------------------------
//   กันบั๊กชนิด "invalid input syntax for type uuid: \"23\"" (ส่ง id ผิดชนิดเข้า query)
//   ชนิด id ในระบบนี้:
//     - UUID    : ตารางหลักส่วนมาก (conversations, messages, qc_scores, ai_review_queue.id ...)
//     - INTEGER : sop_scripts.id, app_users.id (SERIAL) และ *_sop_id / uid ต่าง ๆ
//   ใช้ที่ route handler เพื่อ validate ก่อน query แล้วคืน error ไทยแทน raw SQL error
// ============================================================

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// เป็น UUID (v1–v5) ที่ถูกต้องไหม
function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

// แปลงเป็นจำนวนเต็มบวก (id เชิงตัวเลข) — คืน null ถ้าไม่ใช่
//   รับเฉพาะ "ตัวเลขล้วน" (กัน "23abc" / "1.5" / "" / null)
function parseNumericId(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0)
    return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = parseInt(value.trim(), 10);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

// ตรวจ id ให้ตรงชนิดที่คอลัมน์ต้องการ
//   expectedType: "uuid" | "int"
//   คืน { ok, value, error }  — value เป็นค่าที่พร้อมใช้ (string uuid หรือ number int)
function validateEntityId(value, expectedType) {
  if (value == null || value === "")
    return { ok: false, error: "ไม่พบรหัสอ้างอิง (id) ของรายการ" };
  if (expectedType === "uuid") {
    if (!isUuid(value))
      return {
        ok: false,
        error: "รหัสอ้างอิงไม่ถูกต้อง (ต้องเป็น UUID)",
      };
    return { ok: true, value: String(value).trim() };
  }
  if (expectedType === "int") {
    const n = parseNumericId(value);
    if (n == null)
      return { ok: false, error: "รหัสอ้างอิงไม่ถูกต้อง (ต้องเป็นตัวเลข)" };
    return { ok: true, value: n };
  }
  return { ok: false, error: `ชนิด id ไม่รองรับ: ${expectedType}` };
}

module.exports = { isUuid, parseNumericId, validateEntityId, UUID_RE };

// ตรวจว่าชื่อ admin เป็น "PK" จริงไหม — รองรับฟอนต์ Unicode แปลก
// (small-caps ᴘᴋ, math 𝙿𝙺, decorative ꧁꧂ ฯลฯ) ที่ admin ชอบใช้
// CommonJS

// map ตัวอักษร P/K สไตล์ที่ NFKC ไม่ fold:
//   small caps ᴘᴋ · enclosed/squared 🅿🅺 🄿🄺 ⓅⓀ ⓟⓚ · เผื่อ greek/ตัวคล้าย
const P_VARIANTS = /[ᴘᵽ҆Ⓟⓟ\u{1F17F}\u{1F13F}]/gu;
const K_VARIANTS = /[ᴋⓀⓚ\u{1F17A}\u{1F13A}Κκ]/gu;

function normalizeAdminName(s) {
  let t = String(s || '').normalize('NFKC');     // fold math/fullwidth fonts → ASCII
  t = t.replace(P_VARIANTS, 'P').replace(K_VARIANTS, 'K');
  // ตัด decoration/ช่องว่าง/สัญลักษณ์นำหน้า (꧁ ✦ ★ emoji ฯลฯ) — unicode-aware
  t = t.replace(/^[^0-9A-Za-z฀-๿]+/u, '');
  return t;
}

function isPkName(s) {
  const t = normalizeAdminName(s).toLowerCase();
  return t.startsWith('pk');
}

module.exports = { isPkName, normalizeAdminName };

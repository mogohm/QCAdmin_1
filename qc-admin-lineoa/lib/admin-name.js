// ตรวจว่าชื่อ admin เป็น "PK" จริงไหม — รองรับฟอนต์ Unicode แปลก
// (small-caps ᴘᴋ, math 𝙿𝙺, decorative ꧁꧂ ฯลฯ) ที่ admin ชอบใช้
// CommonJS

// map ตัวอักษร P/K สไตล์ที่ NFKC ไม่ fold (small caps + เผื่อ)
const P_VARIANTS = /[ᴘᵽ҆]/g;
const K_VARIANTS = /[ᴋⓀκ]/g;

function normalizeAdminName(s) {
  let t = String(s || '').normalize('NFKC');     // fold math/fullwidth fonts → ASCII
  t = t.replace(P_VARIANTS, 'P').replace(K_VARIANTS, 'K');
  // ตัด decoration/ช่องว่าง/สัญลักษณ์นำหน้า (꧁ ✦ ★ ฯลฯ)
  t = t.replace(/^[^0-9A-Za-z฀-๿]+/, '');
  return t;
}

function isPkName(s) {
  const t = normalizeAdminName(s).toLowerCase();
  return t.startsWith('pk');
}

module.exports = { isPkName, normalizeAdminName };

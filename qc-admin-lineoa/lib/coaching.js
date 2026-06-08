// AI Coaching — สร้างคำแนะนำเมื่อคำตอบไม่ถูกต้อง/คะแนนต่ำ
// แสดง: คำถามลูกค้า, คำตอบแอดมิน, SOP ที่ match, คำตอบที่ควรเป็น, เหตุผล, ตัวอย่างที่ดีกว่า
// CommonJS
const { normalize } = require('./intent-engine');

const COACH_THRESHOLD = 70; // คะแนนต่ำกว่านี้ → สร้าง coaching

function reasonFrom(scoreResult, sop, adminText) {
  const r = [];
  const d = scoreResult.dimensions || {};
  if (scoreResult.isFatal) r.push('พบข้อผิดพลาดร้ายแรง (fatal): ' + (scoreResult.fatalReasons || []).map(x => x.name).join(', '));
  if (d.responseTime != null && d.responseTime < 80) r.push('ตอบกลับช้ากว่ามาตรฐาน ควรตอบให้เร็วขึ้น');
  if (d.sopAccuracy != null && d.sopAccuracy < 70) r.push(sop ? `คำตอบไม่ตรงกับ SOP "${sop.topic}" ควรอ้างอิงสคริปต์มาตรฐาน` : 'ไม่พบ SOP ที่ตรง คำตอบอาจไม่ครบถ้วน');
  if (d.tone != null && d.tone < 70) r.push('น้ำเสียงควรสุภาพและแสดงความเข้าใจลูกค้ามากขึ้น (เติมคำว่า ค่ะ/ขออภัย/เข้าใจ)');
  if (d.escalation != null && d.escalation < 70) r.push('เคสนี้ควรส่งต่อทีมงาน/Live chat แต่แอดมินไม่ได้แนะนำ');
  if (d.closing != null && d.closing < 60) r.push('ควรปิดการสนทนาให้เรียบร้อย เช่น ยืนยันว่าดำเนินการแล้ว/สอบถามเพิ่มเติม');
  if (!r.length) r.push('คำตอบพอใช้ได้แต่ยังปรับให้ตรง SOP มากขึ้นได้');
  return r;
}

// สร้างตัวอย่างคำตอบที่ดีกว่า — ใช้คำตอบ SOP มาตรฐานเป็นหลัก
function betterReply(sop, adminText) {
  if (sop && sop.answer) {
    let ans = String(sop.answer).trim();
    if (ans.length > 600) ans = ans.slice(0, 600) + ' ...';
    return ans;
  }
  // ไม่มี SOP → แนะนำโครงคำตอบสุภาพ
  return 'แนะนำให้ตอบอย่างสุภาพ ระบุข้อมูลให้ครบถ้วนตามขั้นตอน และปิดท้ายด้วยการยืนยัน/ถามว่ามีอะไรให้ช่วยเพิ่มเติมไหมคะ';
}

// generateCoaching(input) → object หรือ null ถ้าคะแนนดีพอ
function generateCoaching({ customerText = '', adminText = '', scoreResult = {}, sop = null, force = false }) {
  const score = scoreResult.finalScore ?? 100;
  if (!force && score >= COACH_THRESHOLD && !scoreResult.isFatal) return null;

  return {
    customer_question: customerText || '(ไม่มีข้อความลูกค้า)',
    admin_answer: adminText,
    matched_sop: sop ? { topic: sop.topic, intent: sop.intent } : null,
    expected_sop_answer: sop ? sop.answer : null,
    score: score,
    is_fatal: !!scoreResult.isFatal,
    reasons: reasonFrom(scoreResult, sop, adminText),
    suggested_reply: betterReply(sop, adminText),
    intent: scoreResult.intent || null,
  };
}

module.exports = { generateCoaching, COACH_THRESHOLD };

// QC Engine v2 — ให้คะแนน 8 มิติ + fatal error (ละเมิด = 0)
// CommonJS (ใช้ได้ทั้ง Next.js import และ node script require)
const { detectIntent, normalize } = require('./intent-engine');
const { matchSOP, answerSimilarity } = require('./sop-matcher');

const POLITE = ['ค่ะ','ครับ','ขอบคุณ','ขออภัย','รบกวน','ยินดี','นะคะ','นะครับ','กรุณา'];
const RUDE = ['โง่','บ้า','เรื่องมาก','รำคาญ','ไม่ได้ก็ไม่ต้อง','หัดอ่าน','ทำไมไม่อ่าน','ปัญญาอ่อน'];
const EMPATHY = ['เข้าใจ','ไม่ต้องกังวล','ขออภัย','เสียใจ','เร่งตรวจสอบ','ดูแล','ช่วยเช็ค','ขอบคุณที่แจ้ง','ขออภัยในความไม่สะดวก'];
const CLOSING = ['เรียบร้อย','completed','ยินดีให้บริการ','สอบถามเพิ่ม','ดำเนินการให้แล้ว','done','สำเร็จ'];

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const has = (text, arr) => arr.filter(w => text.includes(normalize(w))).length;

// ตรวจ fatal: คืน array ของ rule ที่ละเมิด
function checkFatal(adminText, fatalRules = [], intent = null) {
  const a = normalize(adminText);
  const hits = [];
  for (const r of fatalRules) {
    if (r.is_active === false) continue;
    if (r.applies_to && intent && r.applies_to !== intent) continue;
    const pats = r.patterns || [];
    if (pats.some(p => a.includes(normalize(p)))) hits.push({ code: r.code, name: r.name });
  }
  return hits;
}

// ---- มิติย่อย ----
function dimResponseTime(responseSeconds, limitMin) {
  const limit = Number(limitMin || 5) * 60;
  if (responseSeconds == null) return 80; // ไม่มีข้อมูลเวลา
  if (responseSeconds <= limit) return 100;
  return clamp(100 - Math.ceil((responseSeconds - limit) / 30) * 5);
}
function dimTone(a) {
  const polite = has(a, POLITE), rude = has(a, RUDE), emp = has(a, EMPATHY);
  return clamp(60 + polite * 6 + emp * 8 - rude * 35);
}
function dimSopAccuracy(adminText, sop, sopConfidence) {
  if (!sop) return adminText.length > 25 ? 70 : 45; // ไม่มี SOP เทียบ → กลางๆ
  const sim = answerSimilarity(adminText, sop);
  const conf = (sopConfidence ?? 60) / 100;
  return clamp(sim * (0.5 + 0.5 * conf));
}
function dimDepositWithdraw(adminText, sop) {
  const a = normalize(adminText);
  const signals = ['ลิงก์','ลิ้ง','bit.ly','ยอด','สลิป','บัญชี','โอน','auto','รอสักครู่','ตรวจสอบ','ธนาคาร'];
  const hit = has(a, signals);
  const reqCov = sop ? answerSimilarity(adminText, sop) : 60;
  return clamp(40 + hit * 12 + reqCov * 0.3);
}
function dimKyc(adminText, sop) {
  const a = normalize(adminText);
  const signals = ['ยืนยัน','บัตร','อีเมล','email','รหัส','ปลดล็อค','ตรวจสอบ','เอกสาร','บัญชี'];
  const hit = has(a, signals);
  const reqCov = sop ? answerSimilarity(adminText, sop) : 60;
  return clamp(40 + hit * 12 + reqCov * 0.3);
}
function dimPromoUpsell(adminText, sop) {
  const a = normalize(adminText);
  const signals = ['โปร','โบนัส','เงื่อนไข','ยอด','เครดิต','รับ','สิทธิ','ระยะเวลา','แนะนำ'];
  const hit = has(a, signals);
  const reqCov = sop ? answerSimilarity(adminText, sop) : 60;
  return clamp(45 + hit * 10 + reqCov * 0.3);
}
function dimClosing(a) {
  const c = has(a, CLOSING);
  if (c >= 1) return clamp(80 + c * 8);
  return a.length > 15 ? 65 : 50;
}
function dimEscalation(adminText, sop) {
  if (!sop || !sop.escalation) return 100; // ไม่ต้อง escalate → ไม่หักคะแนน
  const a = normalize(adminText);
  const ok = /live chat|livechat|ติดต่อ|ประสานงาน|ทีมงาน|support/.test(a);
  return ok ? 100 : 40;
}

const BASE_WEIGHTS = { responseTime: 1.5, sopAccuracy: 2.5, tone: 1.5, closing: 1.0, escalation: 1.0 };

// scoreReply({ customerText, adminText, responseSeconds, responseLimitMinutes, sops, fatalRules })
function scoreReply(input) {
  const {
    customerText = '', adminText = '', responseSeconds = null, responseLimitMinutes = 5,
    sops = [], fatalRules = [],
  } = input || {};

  const a = normalize(adminText);
  const det = detectIntent(customerText || adminText);
  const intent = det.intent;

  const m = matchSOP(customerText || adminText, sops, { intent });
  const sop = m.sop;
  const sopConfidence = m.confidence;

  const dims = {
    responseTime: dimResponseTime(responseSeconds, responseLimitMinutes),
    sopAccuracy: dimSopAccuracy(adminText, sop, sopConfidence),
    tone: dimTone(a),
    closing: dimClosing(a),
    escalation: dimEscalation(adminText, sop),
  };
  const weights = { ...BASE_WEIGHTS };
  if (intent === 'deposit' || intent === 'withdraw') { dims.depositWithdraw = dimDepositWithdraw(adminText, sop); weights.depositWithdraw = 2.0; }
  if (intent === 'kyc') { dims.kyc = dimKyc(adminText, sop); weights.kyc = 2.0; }
  if (intent === 'promotion' || intent === 'bonus') { dims.promoUpsell = dimPromoUpsell(adminText, sop); weights.promoUpsell = 1.5; }

  const fatalHits = checkFatal(adminText, fatalRules, intent);
  const isFatal = fatalHits.length > 0;

  let wsum = 0, total = 0;
  for (const k of Object.keys(dims)) { const w = weights[k] || 1; total += dims[k] * w; wsum += w; }
  const finalScore = isFatal ? 0 : clamp(total / (wsum || 1));

  const failReasons = [];
  if (isFatal) failReasons.push('FATAL: ' + fatalHits.map(h => h.name).join(', '));
  if (dims.responseTime < 80) failReasons.push('ตอบช้ากว่า SLA');
  if (dims.sopAccuracy < 70) failReasons.push('คำตอบไม่ตรง SOP มาตรฐาน');
  if (dims.tone < 70) failReasons.push('น้ำเสียง/service mind ต่ำ');
  if (dims.escalation < 70) failReasons.push('ควรส่งต่อทีมงาน (escalation) แต่ไม่ได้ทำ');

  return {
    finalScore, isFatal, fatalReasons: fatalHits,
    intent,
    matchedSop: sop ? { id: sop.id, topic: sop.topic, intent: sop.intent } : null,
    sopConfidence,
    dimensions: dims, weights, failReasons,
    // backward-compat
    speedScore: dims.responseTime,
    correctnessScore: dims.sopAccuracy,
    sentimentScore: dims.tone,
    matchedRules: [],
  };
}

module.exports = { scoreReply, checkFatal, normalizeText: normalize };

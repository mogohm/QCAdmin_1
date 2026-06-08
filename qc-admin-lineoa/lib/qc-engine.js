// QC Engine v3 — ให้คะแนนตาม AI QA Scoring Rubric (จาก Excel Ai-QA Data and SOPs)
//   Greeting&Closing 15 | Problem Solving&Accuracy 20 | Communication&Tone 20
//   Upselling&Promotion 10 | Credit deposit/withdraw 10 | KYC process 10 | Response time 10
//   Minor Errors -5 | Fatal Errors -100 (=0)
// CommonJS (ใช้ได้ทั้ง Next.js import และ node script require)
const { detectIntent, normalize } = require('./intent-engine');
const { matchSOP, answerSimilarity } = require('./sop-matcher');

const POLITE = ['ค่ะ','คะ','ครับ','ขอบคุณ','ขออภัย','รบกวน','ยินดี','นะคะ','นะครับ','กรุณา'];
const RUDE = ['โง่','บ้า','เรื่องมาก','รำคาญ','ไม่ได้ก็ไม่ต้อง','หัดอ่าน','ทำไมไม่อ่าน','ปัญญาอ่อน','ประชด'];
const EMPATHY = ['เข้าใจ','ไม่ต้องกังวล','ขออภัย','เสียใจ','เร่งตรวจสอบ','ดูแล','ช่วยเช็ค','ขอบคุณที่แจ้ง','ขออภัยในความไม่สะดวก'];
const GREETING = ['สวัสดี','ยินดีต้อนรับ','ขอบคุณที่ติดต่อ','แอดมินยินดี'];
const CLOSING = ['เรียบร้อย','completed','ยินดีให้บริการ','สอบถามเพิ่ม','ดำเนินการให้แล้ว','done','สำเร็จ','มีอะไรให้ช่วย'];
const POLITE_ENDING = ['ค่ะ','คะ','ครับ','นะคะ','นะครับ'];

// น้ำหนักตาม rubric (Excel)
const RUBRIC = {
  greetingClosing: 15, problemSolving: 20, communicationTone: 20,
  responseTime: 10, upsellPromotion: 10, creditDepositWithdraw: 10, kycProcess: 10,
};
const MINOR_PENALTY = 5; // Errors เล็กน้อย -5%

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const has = (text, arr) => arr.filter(w => text.includes(normalize(w))).length;

function checkFatal(adminText, fatalRules = [], intent = null) {
  const a = normalize(adminText);
  const hits = [];
  for (const r of fatalRules) {
    if (r.is_active === false) continue;
    if (r.applies_to && intent && r.applies_to !== intent) continue;
    if ((r.patterns || []).some(p => a.includes(normalize(p)))) hits.push({ code: r.code, name: r.name });
  }
  return hits;
}

// ตรวจ minor errors (หัก -5%): ไม่มีคำลงท้ายสุภาพ / สั้นเกินไป / ส่งข้อมูลซ้ำ
function checkMinor(adminText) {
  const a = normalize(adminText);
  const issues = [];
  if (!POLITE_ENDING.some(w => a.includes(w))) issues.push('ไม่มีคำลงท้ายสุภาพ (ค่ะ/ครับ)');
  if (a.replace(/\s/g, '').length < 8) issues.push('คำตอบสั้นเกินไป');
  // ส่งข้อความซ้ำ (มีประโยคซ้ำติดกัน)
  const lines = adminText.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (lines.length >= 2 && new Set(lines).size < lines.length) issues.push('ส่งข้อมูลซ้ำกัน');
  return issues;
}

// ---- มิติตาม rubric ----
function dimResponseTime(sec, limitMin) {
  const limit = Number(limitMin || 5) * 60;
  if (sec == null) return 80;
  if (sec <= limit) return 100;
  return clamp(100 - Math.ceil((sec - limit) / 30) * 5);
}
function dimGreetingClosing(a) {
  const g = has(a, GREETING), c = has(a, CLOSING), p = has(a, POLITE);
  let s = 55 + c * 15 + g * 10 + Math.min(p, 2) * 7;
  return clamp(s);
}
function dimProblemSolving(adminText, sop, sopConfidence) {
  if (!sop) return adminText.length > 25 ? 70 : 45;
  const sim = answerSimilarity(adminText, sop);
  const conf = (sopConfidence ?? 60) / 100;
  return clamp(sim * (0.5 + 0.5 * conf));
}
function dimCommunicationTone(a) {
  const polite = has(a, POLITE), rude = has(a, RUDE), emp = has(a, EMPATHY);
  return clamp(62 + polite * 6 + emp * 8 - rude * 35);
}
function dimCreditDepositWithdraw(adminText, sop) {
  const a = normalize(adminText);
  const hit = has(a, ['ลิงก์','ลิ้ง','bit.ly','ยอด','สลิป','บัญชี','โอน','auto','รอสักครู่','ตรวจสอบ','ธนาคาร']);
  const reqCov = sop ? answerSimilarity(adminText, sop) : 60;
  return clamp(40 + hit * 12 + reqCov * 0.3);
}
function dimKyc(adminText, sop) {
  const a = normalize(adminText);
  const hit = has(a, ['ยืนยัน','บัตร','อีเมล','email','รหัส','ปลดล็อค','ตรวจสอบ','เอกสาร','kyc']);
  const reqCov = sop ? answerSimilarity(adminText, sop) : 60;
  return clamp(40 + hit * 12 + reqCov * 0.3);
}
function dimUpsell(adminText, sop) {
  const a = normalize(adminText);
  const hit = has(a, ['โปร','โบนัส','เงื่อนไข','ยอด','เครดิต','รับเพิ่ม','สิทธิ','คุ้ม','แนะนำ']);
  const reqCov = sop ? answerSimilarity(adminText, sop) : 55;
  return clamp(45 + hit * 10 + reqCov * 0.3);
}

// แปลงคะแนน → Tier ค่าคอม (จาก Excel)
function commissionTier(score) {
  if (score >= 90) return { tier: 1, name: 'Excellent', commission: 'full' };
  if (score >= 80) return { tier: 2, name: 'Standard', commission: 'standard' };
  if (score >= 70) return { tier: 3, name: 'Warning', commission: 'reduced' };
  return { tier: 4, name: 'Critical', commission: 'none' };
}

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

  // มิติที่ใช้เสมอ
  const dims = {
    greetingClosing: dimGreetingClosing(a),
    problemSolving: dimProblemSolving(adminText, sop, sopConfidence),
    communicationTone: dimCommunicationTone(a),
    responseTime: dimResponseTime(responseSeconds, responseLimitMinutes),
  };
  const weights = {
    greetingClosing: RUBRIC.greetingClosing, problemSolving: RUBRIC.problemSolving,
    communicationTone: RUBRIC.communicationTone, responseTime: RUBRIC.responseTime,
  };
  // มิติเฉพาะ intent
  if (intent === 'promotion' || intent === 'bonus') { dims.upsellPromotion = dimUpsell(adminText, sop); weights.upsellPromotion = RUBRIC.upsellPromotion; }
  if (intent === 'deposit' || intent === 'withdraw') { dims.creditDepositWithdraw = dimCreditDepositWithdraw(adminText, sop); weights.creditDepositWithdraw = RUBRIC.creditDepositWithdraw; }
  if (intent === 'kyc') { dims.kycProcess = dimKyc(adminText, sop); weights.kycProcess = RUBRIC.kycProcess; }

  // fatal + minor
  const fatalHits = checkFatal(adminText, fatalRules, intent);
  const isFatal = fatalHits.length > 0;
  const minorIssues = checkMinor(adminText);

  // รวมแบบถ่วงน้ำหนัก (normalize เฉพาะมิติที่ใช้) แล้วหัก minor
  let wsum = 0, total = 0;
  for (const k of Object.keys(dims)) { const w = weights[k] || 0; total += dims[k] * w; wsum += w; }
  let base = wsum ? total / wsum : 0;
  if (minorIssues.length) base -= MINOR_PENALTY;
  const finalScore = isFatal ? 0 : clamp(base);

  const failReasons = [];
  if (isFatal) failReasons.push('FATAL: ' + fatalHits.map(h => h.name).join(', '));
  if (dims.responseTime < 80) failReasons.push('ตอบช้ากว่า SLA');
  if (dims.problemSolving < 70) failReasons.push('คำตอบไม่ตรง SOP มาตรฐาน');
  if (dims.communicationTone < 70) failReasons.push('น้ำเสียง/service mind ต่ำ');
  if (dims.greetingClosing < 65) failReasons.push('ขาดการทักทาย/ปิดการสนทนา');
  for (const mi of minorIssues) failReasons.push('Minor: ' + mi);

  return {
    finalScore, isFatal, fatalReasons: fatalHits, minorIssues,
    intent,
    matchedSop: sop ? { id: sop.id, topic: sop.topic, intent: sop.intent } : null,
    sopConfidence,
    dimensions: dims, weights, rubric: RUBRIC, failReasons,
    commissionTier: commissionTier(isFatal ? 0 : clamp(base)),
    // backward-compat
    speedScore: dims.responseTime,
    correctnessScore: dims.problemSolving,
    sentimentScore: dims.communicationTone,
    matchedRules: [],
  };
}

module.exports = { scoreReply, checkFatal, checkMinor, commissionTier, RUBRIC, normalizeText: normalize };

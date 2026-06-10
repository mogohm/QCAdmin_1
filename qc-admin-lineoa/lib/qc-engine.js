// QC Engine v4 — AI QA Scoring Rubric (จาก Excel) + evidence + SLA exception
//   Greeting&Closing 15 | Problem Solving&Accuracy 20 | Communication&Tone 20
//   Upselling&Promotion 10 | Credit deposit/withdraw 10 | KYC process 10 | Response time 10
//   Minor Errors -5 | Fatal Errors = score 0
// มิติที่ไม่เกี่ยวกับ intent → N/A (ไม่คิดในตัวหาร ไม่ทำให้คะแนนเพี้ยน) แต่บันทึกเหตุผลไว้
// CommonJS (ใช้ได้ทั้ง Next.js import และ node script require)
const { detectIntent, normalize } = require('./intent-engine');
const { matchSOP, answerSimilarity } = require('./sop-matcher');

const POLITE = ['ค่ะ','คะ','ครับ','ขอบคุณ','ขออภัย','รบกวน','ยินดี','นะคะ','นะครับ','กรุณา'];
const RUDE = ['โง่','บ้า','เรื่องมาก','รำคาญ','ไม่ได้ก็ไม่ต้อง','หัดอ่าน','ทำไมไม่อ่าน','ปัญญาอ่อน','ประชด'];
const EMPATHY = ['เข้าใจ','ไม่ต้องกังวล','ขออภัย','เสียใจ','เร่งตรวจสอบ','ดูแล','ช่วยเช็ค','ขอบคุณที่แจ้ง','ขออภัยในความไม่สะดวก'];
const GREETING = ['สวัสดี','ยินดีต้อนรับ','ขอบคุณที่ติดต่อ','แอดมินยินดี'];
const CLOSING = ['เรียบร้อย','completed','ยินดีให้บริการ','สอบถามเพิ่ม','ดำเนินการให้แล้ว','done','สำเร็จ','มีอะไรให้ช่วย'];
const POLITE_ENDING = ['ค่ะ','คะ','ครับ','นะคะ','นะครับ'];

// rubric: weight + applicable(intent) — fixed ตาม Excel
const RUBRIC = [
  { code: 'greetingClosing',       label: 'Greeting & Closing',          weight: 15, applies: () => true },
  { code: 'problemSolving',        label: 'Problem Solving & Accuracy',  weight: 20, applies: () => true },
  { code: 'communicationTone',     label: 'Communication & Tone',        weight: 20, applies: () => true },
  { code: 'responseTime',          label: 'Response Time',               weight: 10, applies: () => true },
  { code: 'upsellPromotion',       label: 'Upselling & Promotion',       weight: 10, applies: (i) => i === 'promotion' || i === 'bonus' },
  { code: 'creditDepositWithdraw', label: 'Credit Deposit/Withdraw',     weight: 10, applies: (i) => i === 'deposit' || i === 'withdraw' },
  { code: 'kycProcess',            label: 'KYC Process',                 weight: 10, applies: (i) => i === 'kyc' },
];
const MINOR_PENALTY = 5;

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const hitWords = (text, arr) => arr.filter(w => text.includes(normalize(w)));

function checkFatal(adminText, fatalRules = [], intent = null) {
  const a = normalize(adminText);
  const hits = [];
  for (const r of fatalRules) {
    if (r.is_active === false) continue;
    if (r.applies_to && intent && r.applies_to !== intent) continue;
    const matched = (r.patterns || []).filter(p => a.includes(normalize(p)));
    if (matched.length) hits.push({ code: r.code, name: r.name, matched });
  }
  return hits;
}

function checkMinor(adminText) {
  const a = normalize(adminText);
  const issues = [];
  if (!POLITE_ENDING.some(w => a.includes(w))) issues.push('ไม่มีคำลงท้ายสุภาพ (ค่ะ/ครับ)');
  if (a.replace(/\s/g, '').length < 8) issues.push('คำตอบสั้นเกินไป');
  const lines = String(adminText).split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (lines.length >= 2 && new Set(lines).size < lines.length) issues.push('ส่งข้อมูลซ้ำกัน');
  return issues;
}

// ---- มิติ: คืน { raw, evidence, suggestion } ----
function dimGreetingClosing(a) {
  const g = hitWords(a, GREETING), c = hitWords(a, CLOSING), p = hitWords(a, POLITE);
  const raw = clamp(55 + c.length * 15 + g.length * 10 + Math.min(p.length, 2) * 7);
  return { raw, evidence: { greeting: g, closing: c, polite: p.slice(0, 4) },
    suggestion: raw < 65 ? 'ควรทักทาย/ปิดการสนทนาให้เรียบร้อย เช่น ยืนยันว่าดำเนินการแล้ว/สอบถามเพิ่มเติม' : null };
}
function dimProblemSolving(adminText, sop, sopConfidence) {
  if (!sop) return { raw: adminText.length > 25 ? 70 : 45, evidence: { matched_sop: null, note: 'ไม่พบ SOP ที่ตรง' },
    suggestion: 'ไม่พบ SOP ที่ตรง — ตรวจคำตอบให้ครบถ้วนตามขั้นตอน' };
  const sim = answerSimilarity(adminText, sop);
  const conf = (sopConfidence ?? 60) / 100;
  const at = normalize(adminText);
  const req = (sop.required_keywords || []).map(normalize);
  const present = req.filter(k => at.includes(k));
  const missing = req.filter(k => !at.includes(k));
  const forb = (sop.forbidden_keywords || []).map(normalize).filter(k => at.includes(k));
  const raw = clamp(sim * (0.5 + 0.5 * conf));
  return {
    raw,
    evidence: { matched_sop: { id: sop.id, topic: sop.topic }, similarity: sim, sop_confidence: sopConfidence,
      matched_keywords: present, missing_required_keywords: missing, forbidden_keyword_hit: forb },
    suggestion: raw < 70 ? `อ้างอิง SOP "${sop.topic}" ให้ครบ${missing.length ? ' (ขาด: ' + missing.join(', ') + ')' : ''}` : null,
  };
}
function dimCommunicationTone(a) {
  const polite = hitWords(a, POLITE), rude = hitWords(a, RUDE), emp = hitWords(a, EMPATHY);
  const raw = clamp(62 + polite.length * 6 + emp.length * 8 - rude.length * 35);
  return { raw, evidence: { polite: polite.slice(0, 5), empathy: emp, rude },
    suggestion: raw < 70 ? 'ใช้ภาษาสุภาพและแสดงความเข้าใจลูกค้ามากขึ้น (เติม ค่ะ/ขออภัย/เข้าใจ)' : null };
}
function dimResponseTime(sec, limitMin, slaException) {
  const limit = Number(limitMin || 5) * 60;
  let raw, note;
  if (sec == null) { raw = 80; note = 'ไม่มีข้อมูลเวลา'; }
  else if (sec <= limit) { raw = 100; note = `ตอบใน ${sec}s (≤ ${limit}s)`; }
  else { raw = clamp(100 - Math.ceil((sec - limit) / 30) * 5); note = `ตอบใน ${sec}s (เกิน ${limit}s)`; }
  if (slaException && raw < 80) { raw = 80; note += ' · อยู่ในช่วง System Event (ไม่หักเต็ม)'; }
  return { raw, evidence: { response_seconds: sec, limit_seconds: limit, sla_exception: !!slaException, detail: note },
    suggestion: raw < 80 && !slaException ? 'ตอบกลับให้เร็วขึ้นภายใน SLA' : null };
}
function dimSignal(adminText, sop, signals, label) {
  const a = normalize(adminText);
  const hits = hitWords(a, signals);
  const reqCov = sop ? answerSimilarity(adminText, sop) : 55;
  const raw = clamp(42 + hits.length * 11 + reqCov * 0.3);
  return { raw, evidence: { matched_signals: hits, sop: sop ? { id: sop.id, topic: sop.topic } : null },
    suggestion: raw < 70 ? `${label}: ระบุข้อมูล/ขั้นตอนให้ครบตาม SOP` : null };
}

function commissionTier(score) {
  if (score >= 90) return { tier: 1, name: 'Excellent', commission: 'full' };
  if (score >= 80) return { tier: 2, name: 'Standard', commission: 'standard' };
  if (score >= 70) return { tier: 3, name: 'Warning', commission: 'reduced' };
  return { tier: 4, name: 'Critical', commission: 'none' };
}

// scoreReply({ customerText, adminText, responseSeconds, responseLimitMinutes, sops, fatalRules, slaException })
function scoreReply(input) {
  const {
    customerText = '', adminText = '', responseSeconds = null, responseLimitMinutes = 5,
    sops = [], fatalRules = [], slaException = false,
  } = input || {};

  const a = normalize(adminText);
  const det = detectIntent(customerText || adminText);
  const intent = det.intent;
  const m = matchSOP(customerText || adminText, sops, { intent });
  const sop = m.sop;
  const sopConfidence = m.confidence;

  // ประเมินทุกมิติ (มิติที่ไม่ applies = N/A)
  const compute = {
    greetingClosing: () => dimGreetingClosing(a),
    problemSolving: () => dimProblemSolving(adminText, sop, sopConfidence),
    communicationTone: () => dimCommunicationTone(a),
    responseTime: () => dimResponseTime(responseSeconds, responseLimitMinutes, slaException),
    upsellPromotion: () => dimSignal(adminText, sop, ['โปร','โบนัส','เงื่อนไข','ยอด','เครดิต','รับเพิ่ม','สิทธิ','คุ้ม','แนะนำ'], 'Upsell'),
    creditDepositWithdraw: () => dimSignal(adminText, sop, ['ลิงก์','ลิ้ง','bit.ly','ยอด','สลิป','บัญชี','โอน','auto','รอสักครู่','ตรวจสอบ','ธนาคาร'], 'Deposit/Withdraw'),
    kycProcess: () => dimSignal(adminText, sop, ['ยืนยัน','บัตร','อีเมล','email','รหัส','ปลดล็อค','ตรวจสอบ','เอกสาร','kyc'], 'KYC'),
  };

  const details = [];        // per-dimension (qc_score_details)
  const dimensions = {};     // flat {code: raw} เฉพาะ applicable (dimension_scores column + radar)
  let total = 0, wsum = 0;

  for (const r of RUBRIC) {
    const applicable = r.applies(intent);
    if (!applicable) {
      details.push({ category_code: r.code, raw_score: null, weighted_score: null, max_score: r.weight,
        pass: null, applicable: false, evidence: { reason: 'N/A — ไม่เกี่ยวกับ intent ' + intent },
        fail_reason: null, suggestion: null });
      continue;
    }
    const res = compute[r.code]();
    const weighted = +(res.raw / 100 * r.weight).toFixed(2);
    total += res.raw * r.weight; wsum += r.weight;
    dimensions[r.code] = res.raw;
    details.push({
      category_code: r.code, raw_score: res.raw, weighted_score: weighted, max_score: r.weight,
      pass: res.raw >= 70, applicable: true, evidence: res.evidence,
      fail_reason: res.raw < 70 ? (res.suggestion || 'ต่ำกว่าเกณฑ์') : null,
      suggestion: res.suggestion || null,
    });
  }

  const fatalHits = checkFatal(adminText, fatalRules, intent);
  const isFatal = fatalHits.length > 0;
  const minorIssues = checkMinor(adminText);

  let base = wsum ? total / wsum : 0;
  if (minorIssues.length) base -= MINOR_PENALTY;
  const finalScore = isFatal ? 0 : clamp(base);

  // minor / fatal เป็น detail rows ด้วย
  details.push({ category_code: 'minorError', raw_score: minorIssues.length ? 0 : 100,
    weighted_score: minorIssues.length ? -MINOR_PENALTY : 0, max_score: -MINOR_PENALTY,
    pass: minorIssues.length === 0, applicable: true, evidence: { issues: minorIssues },
    fail_reason: minorIssues.length ? minorIssues.join('; ') : null, suggestion: null });
  details.push({ category_code: 'fatalError', raw_score: isFatal ? 0 : 100,
    weighted_score: isFatal ? 0 : null, max_score: 0, pass: !isFatal, applicable: true,
    evidence: { hits: fatalHits }, fail_reason: isFatal ? fatalHits.map(h => h.name).join('; ') : null, suggestion: null });

  const psEv = details.find(d => d.category_code === 'problemSolving')?.evidence || {};
  const toneEv = details.find(d => d.category_code === 'communicationTone')?.evidence || {};
  const rtEv = details.find(d => d.category_code === 'responseTime')?.evidence || {};

  const failReasons = [];
  if (isFatal) failReasons.push('FATAL: ' + fatalHits.map(h => h.name).join(', '));
  for (const d of details) if (d.applicable && d.pass === false && d.fail_reason && !['minorError'].includes(d.category_code)) {
    if (d.category_code !== 'fatalError') failReasons.push(`${d.category_code}: ${d.fail_reason}`);
  }
  for (const mi of minorIssues) failReasons.push('Minor: ' + mi);

  return {
    finalScore, isFatal, fatalReasons: fatalHits, minorIssues, slaException: !!slaException,
    intent,
    matchedSop: sop ? { id: sop.id, topic: sop.topic, intent: sop.intent } : null,
    sopConfidence,
    dimensions, details,
    evidence: {
      matched_sop: sop ? { id: sop.id, topic: sop.topic } : null,
      matched_keywords: psEv.matched_keywords || [],
      missing_required_keywords: psEv.missing_required_keywords || [],
      forbidden_keyword_hit: psEv.forbidden_keyword_hit || [],
      tone_words: toneEv.polite || [], rude_words: toneEv.rude || [],
      response_time: rtEv, minor: minorIssues, fatal: fatalHits, sla_exception: !!slaException,
    },
    failReasons, commissionTier: commissionTier(finalScore),
    // backward-compat
    speedScore: dimensions.responseTime ?? 80,
    correctnessScore: dimensions.problemSolving ?? 0,
    sentimentScore: dimensions.communicationTone ?? 0,
    matchedRules: [],
  };
}

module.exports = { scoreReply, checkFatal, checkMinor, commissionTier, RUBRIC, normalizeText: normalize };

// SOP Matcher — รับข้อความลูกค้า → หา SOP ที่ตรงที่สุด
// รองรับ Exact / Keyword / Fuzzy + confidence 0-100
// CommonJS (ใช้ได้ทั้ง Next.js และ node script)
const { detectIntent, normalize } = require("./intent-engine");

// แตก token ผสมไทย/อังกฤษ (อังกฤษเป็นคำ, ไทยเป็น n-gram 2 ตัว เพื่อ fuzzy ภาษาที่ไม่มีช่องว่าง)
function tokens(text = "") {
  const t = normalize(text);
  const en = t.match(/[a-z0-9][a-z0-9&_]+/g) || [];
  const thChunks = t.match(/[฀-๿]+/g) || [];
  const thBigrams = [];
  for (const c of thChunks) {
    if (c.length <= 2) thBigrams.push(c);
    else for (let i = 0; i < c.length - 1; i++) thBigrams.push(c.slice(i, i + 2));
  }
  return new Set([...en, ...thBigrams]);
}

// Dice coefficient ระหว่าง 2 token set (0-1)
function dice(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let inter = 0;
  for (const x of aSet) if (bSet.has(x)) inter++;
  return (2 * inter) / (aSet.size + bSet.size);
}

// คะแนน keyword: สัดส่วน keyword ของ SOP ที่พบในข้อความ
function keywordScore(text, sop) {
  const t = normalize(text);
  const kws = (sop.keywords || []).map((k) => normalize(k)).filter(Boolean);
  if (!kws.length) return 0;
  const hit = kws.filter((k) => t.includes(k)).length;
  return hit / kws.length;
}

// หา SOP ที่ตรงที่สุดสำหรับข้อความ (ปกติคือข้อความลูกค้า)
//   sops: array จาก DB/JSON (มี topic, keywords, intent, answer, required_keywords)
function matchSOP(text, sops = [], opts = {}) {
  if (!text || !sops.length) return { sop: null, confidence: 0, method: "none", intent: "general" };
  const det = opts.intent ? { intent: opts.intent } : detectIntent(text);
  const tset = tokens(text);
  const nt = normalize(text);

  let best = null;
  for (const sop of sops) {
    const topic = normalize(sop.topic || sop.question || "");
    // 1) Exact: ข้อความ ⊇ topic หรือ topic ⊇ ข้อความ
    let exact = 0;
    if (topic && (nt.includes(topic) || (topic.length > 6 && topic.includes(nt)))) exact = 1;
    // 2) Keyword
    const kw = keywordScore(text, sop);
    // 3) Fuzzy (Dice ของ token)
    const fz = dice(tset, tokens((sop.topic || "") + " " + (sop.keywords || []).join(" ")));
    // intent ตรงกัน → โบนัส
    const intentBonus = sop.intent && det.intent && sop.intent === det.intent ? 0.15 : 0;

    const raw = Math.max(exact, kw * 0.9, fz) + intentBonus;
    const method = exact ? "exact" : kw >= fz ? "keyword" : "fuzzy";
    const confidence = Math.round(Math.min(100, raw * 100));
    if (!best || confidence > best.confidence)
      best = { sop, confidence, method, intent: det.intent, _raw: { exact, kw: +kw.toFixed(2), fz: +fz.toFixed(2) } };
  }
  return best || { sop: null, confidence: 0, method: "none", intent: det.intent };
}

// วัดความใกล้เคียงคำตอบ admin กับคำตอบ SOP (สำหรับ QC SOP-accuracy) 0-100
function answerSimilarity(adminText, sop) {
  if (!sop) return 0;
  const a = tokens(adminText);
  const b = tokens(sop.answer || "");
  const sim = dice(a, b); // ความเหมือนเนื้อหา
  // required keyword coverage
  const req = (sop.required_keywords || []).map((k) => normalize(k)).filter(Boolean);
  const at = normalize(adminText);
  const reqCov = req.length ? req.filter((k) => at.includes(k)).length / req.length : null;
  // รวม: เน้น required ถ้ามี
  const score = reqCov === null ? sim : reqCov * 0.6 + sim * 0.4;
  return Math.round(Math.min(100, score * 100));
}

module.exports = { matchSOP, answerSimilarity, tokens, dice };

// test-qc-accuracy.js — ชุดทดสอบความแม่นของ QC จากเคสจริง (≥30 cases)
//   npm run test:qc-accuracy
// แต่ละเคสกำหนด: ข้อความลูกค้า, คำตอบแอดมิน, intent ที่คาด, ผลที่คาด (pass/fail)
// รายงานต่อเคส: expected intent | detected intent | matched SOP | confidence | expected | score | result
const fs = require("fs");
const path = require("path");
const { detectIntent } = require("../lib/intent-engine");
const { matchSOP } = require("../lib/sop-matcher");
const { scoreReply } = require("../lib/qc-engine");

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "sop-data.json"), "utf8"));
const sops = data.scripts.map((s, i) => ({ id: i + 1, ...s }));
const fatalRules = data.fatal_rules;

const PASS = 70; // เกณฑ์ผ่าน
// expect: 'pass' = คะแนน≥70, 'fail' = คะแนน<70, 'fatal' = isFatal
const CASES = [
  // --- สมัคร (register) ---
  {
    domain: "สมัคร",
    cust: "สมัครสมาชิกยังไงครับ",
    admin: "ยินดีต้อนรับค่ะ รบกวนแจ้งเบอร์โทรและบัญชีธนาคารเพื่อสมัครสมาชิกได้เลยนะคะ ดำเนินการให้เรียบร้อยค่ะ",
    intent: "register",
    expect: "pass",
    sec: 40,
  },
  { domain: "สมัคร", cust: "อยากเปิดไอดีใหม่", admin: "ไม่รู้", intent: "register", expect: "fail", sec: 60 },
  {
    domain: "สมัคร",
    cust: "ขอสมัคร id หน่อย",
    admin: "รบกวนแจ้งข้อมูลยืนยันตัวตนเพื่อลงทะเบียนค่ะ ยินดีให้บริการนะคะ",
    intent: "register",
    expect: "pass",
    sec: 50,
  },

  // --- KYC ---
  {
    domain: "KYC",
    cust: "บัญชีโดนล็อค ปลดล็อคยังไง",
    admin: "รบกวนยืนยันตัวตนด้วยบัตรประชาชนและอีเมลที่ลงทะเบียนไว้ เพื่อปลดล็อค id ให้นะคะ",
    intent: "kyc",
    expect: "pass",
    sec: 60,
  },
  {
    domain: "KYC",
    cust: "ลืมรหัสผ่าน เข้าไม่ได้",
    admin: "รบกวนยืนยันตัวตนเพื่อรีเซ็ตรหัสผ่านค่ะ ขออภัยในความไม่สะดวกนะคะ",
    intent: "kyc",
    expect: "pass",
    sec: 80,
  },
  { domain: "KYC", cust: "โดนล็อคไอดี", admin: "ก็ปลดเองสิ", intent: "kyc", expect: "fail", sec: 120 },

  // --- ฝาก (deposit) ---
  {
    domain: "ฝาก",
    cust: "ขอลิงก์ฝากเงินหน่อยค่ะ",
    admin:
      "วิธีเติมเงิน Auto กดที่เมนูฝากทุกครั้งนะคะ ลิงก์ https://bit.ly/dep ค่ะ ตรวจสอบยอดให้แล้วค่ะ ยินดีให้บริการนะคะ",
    intent: "deposit",
    expect: "pass",
    sec: 45,
  },
  {
    domain: "ฝาก",
    cust: "โอนเงินแล้วยอดไม่เข้า",
    admin: "รบกวนส่งสลิปการโอนเพื่อตรวจสอบยอดให้นะคะ รอสักครู่ค่ะ",
    intent: "deposit",
    expect: "pass",
    sec: 90,
  },
  { domain: "ฝาก", cust: "เติมเงินยังไง", admin: "เติมเอง", intent: "deposit", expect: "fail", sec: 30 },
  { domain: "ฝาก", cust: "ฝากเงินไม่เข้า", admin: "ไม่รู้ ไปถามที่อื่น", intent: "deposit", expect: "fatal", sec: 200 },

  // --- ถอน (withdraw) ---
  {
    domain: "ถอน",
    cust: "ขอลิงก์ถอนเงิน",
    admin: "รบกวนรอสักครู่นะคะ ตรวจสอบยอดและส่งลิงก์ถอนให้ค่ะ ดำเนินการให้เรียบร้อยค่ะ",
    intent: "withdraw",
    expect: "pass",
    sec: 60,
  },
  {
    domain: "ถอน",
    cust: "ถอนเงินนานมาก",
    admin: "ขออภัยในความล่าช้านะคะ ธนาคารดีเลย์ กำลังเร่งตรวจสอบยอดถอนให้ค่ะ",
    intent: "withdraw",
    expect: "pass",
    sec: 120,
  },
  { domain: "ถอน", cust: "ถอนยังไง", admin: "ถอนเองสิ ง่ายจะตาย", intent: "withdraw", expect: "fail", sec: 60 },

  // --- โปรโมชัน (promotion) ---
  {
    domain: "โปรโมชัน",
    cust: "มีโปรโมชั่นอะไรบ้าง",
    admin: "ตอนนี้มีโปรฮันนีมูนรับเครดิตเพิ่มค่ะ เงื่อนไขคือฝากขั้นต่ำตามที่กำหนด รับสิทธิ์ได้เลยนะคะ คุ้มมากค่ะ",
    intent: "promotion",
    expect: "pass",
    sec: 50,
  },
  {
    domain: "โปรโมชัน",
    cust: "โปรโมชันฮันนีมูนคืออะไร",
    admin: "เป็นโปรรับโบนัสเพิ่มค่ะ แนะนำให้รับสิทธิ์ตามเงื่อนไขยอดฝากนะคะ",
    intent: "promotion",
    expect: "pass",
    sec: 70,
  },

  // --- โบนัส (bonus) ---
  {
    domain: "โบนัส",
    cust: "โบนัสคาสิโนรับยังไง",
    admin: "สำหรับคาสิโน รบกวนติดต่อ Live chat support ทางหน้าเว็บ Natural8 ได้เลยนะคะ ยินดีให้บริการค่ะ",
    intent: "bonus",
    expect: "pass",
    sec: 55,
  },
  {
    domain: "โบนัส",
    cust: "ขอเงินคืน cashback",
    admin: "เงินคืนเข้าอัตโนมัติตามเงื่อนไขค่ะ ตรวจสอบยอดเครดิตให้แล้วนะคะ",
    intent: "bonus",
    expect: "pass",
    sec: 60,
  },

  // --- Poker ---
  {
    domain: "Poker",
    cust: "Rush & Cash เล่นยังไง",
    admin: "Rush & Cash เป็นเกม cash game แบบเร็วค่ะ พับแล้วย้ายโต๊ะใหม่ทันที อธิบายกติกาให้นะคะ ยินดีให้บริการค่ะ",
    intent: "poker",
    expect: "pass",
    sec: 80,
  },
  {
    domain: "Poker",
    cust: "PLO คืออะไร",
    admin: "PLO คือ Pot Limit Omaha ถือ 4 ใบค่ะ แนะนำกติกาเบื้องต้นให้นะคะ",
    intent: "poker",
    expect: "pass",
    sec: 70,
  },
  { domain: "Poker", cust: "EV cashout คืออะไร", admin: "ไม่รู้เหมือนกัน", intent: "poker", expect: "fail", sec: 60 },

  // --- Jackpot ---
  {
    domain: "Jackpot",
    cust: "Bad Beat Jackpot คืออะไร",
    admin: "Bad Beat Jackpot คือแจ็คพอตเมื่อไพ่แรงแพ้ค่ะ อธิบายเงื่อนไขการรับให้นะคะ ยินดีให้บริการค่ะ",
    intent: "jackpot",
    expect: "pass",
    sec: 75,
  },
  {
    domain: "Jackpot",
    cust: "leaderboard ดูที่ไหน",
    admin: "ดูกระดาน leaderboard ได้ที่หน้าโปรแกรมค่ะ แจ้งวิธีดูอันดับให้นะคะ",
    intent: "jackpot",
    expect: "pass",
    sec: 65,
  },

  // --- Tournament ---
  {
    domain: "Tournament",
    cust: "Spin & Gold เล่นยังไง",
    admin: "Spin & Gold เป็นทัวร์ 3 คนแบบสุ่มเงินรางวัลค่ะ บายอินตามที่เลือก อธิบายให้นะคะ ยินดีให้บริการค่ะ",
    intent: "tournament",
    expect: "pass",
    sec: 80,
  },
  {
    domain: "Tournament",
    cust: "final table คืออะไร",
    admin: "final table คือโต๊ะสุดท้ายของทัวร์นาเมนต์ค่ะ แจ้งรายละเอียดให้นะคะ",
    intent: "tournament",
    expect: "pass",
    sec: 70,
  },
  {
    domain: "Tournament",
    cust: "ตั๋วทัวร์ใช้ยังไง",
    admin: "ใช้ตั๋ว buy-in เข้าทัวร์ได้เลยค่ะ แจ้งขั้นตอนให้นะคะ ยินดีให้บริการค่ะ",
    intent: "tournament",
    expect: "pass",
    sec: 60,
  },

  // --- Technical Issue ---
  {
    domain: "Technical",
    cust: "เข้าเกมไม่ได้ ระบบล่ม",
    admin: "ขออภัยในความไม่สะดวกนะคะ ระบบกำลังปิดปรับปรุง รบกวนรอสักครู่ เร่งตรวจสอบให้ค่ะ",
    intent: "technical_issue",
    expect: "pass",
    sec: 90,
  },
  {
    domain: "Technical",
    cust: "ดาวน์โหลดโปรแกรมยังไง",
    admin: "รบกวนดาวน์โหลดผ่านลิงก์ในหน้าเว็บค่ะ รองรับทั้ง iOS และ Android แจ้งขั้นตอนให้นะคะ",
    intent: "technical_issue",
    expect: "pass",
    sec: 70,
  },
  {
    domain: "Technical",
    cust: "ทัวร์ล่มกลางคัน",
    admin: "เรื่องมากจัง",
    intent: "technical_issue",
    expect: "fatal",
    sec: 100,
  },

  // --- Live Chat Escalation ---
  {
    domain: "Escalation",
    cust: "ขอติดต่อทีมงาน live chat",
    admin: "รบกวนติดต่อทีม Live chat support ทางหน้าเว็บได้เลยนะคะ ประสานงานให้เรียบร้อยค่ะ ยินดีให้บริการค่ะ",
    intent: "escalation",
    expect: "pass",
    sec: 50,
  },
  {
    domain: "Escalation",
    cust: "อยากคุยกับ support team",
    admin: "รบกวนติดต่อซัพพอร์ตผ่าน live chat นะคะ ดูแลให้เรียบร้อยค่ะ",
    intent: "escalation",
    expect: "pass",
    sec: 60,
  },

  // --- rude / fatal ---
  {
    domain: "Rude/Fatal",
    cust: "ถอนเงินยังไง",
    admin: "โง่จริงๆ หัดอ่านเองบ้าง",
    intent: "withdraw",
    expect: "fatal",
    sec: 30,
  },
  { domain: "Rude/Fatal", cust: "สมัครยังไง", admin: "รำคาญ ถามอยู่ได้", intent: "register", expect: "fatal", sec: 40 },

  // --- SLA exception (ตอบช้าแต่อยู่ในช่วง system event) ---
  {
    domain: "SLA-exception",
    cust: "ถอนเงินยังไง",
    admin: "รบกวนรอสักครู่นะคะ ระบบธนาคารปิดปรับปรุง กำลังตรวจสอบยอดถอนให้ค่ะ ขออภัยในความไม่สะดวกนะคะ",
    intent: "withdraw",
    expect: "pass",
    sec: 1800,
    sla: true,
  },
  {
    domain: "SLA-normal",
    cust: "ถอนเงินยังไง",
    admin: "รบกวนรอสักครู่นะคะ ตรวจสอบยอดถอนให้ค่ะ",
    intent: "withdraw",
    expect: "fail",
    sec: 3600,
    sla: false,
  },
];

let pass = 0,
  fail = 0,
  intentHit = 0;
const W = { dom: 14, ei: 13, di: 13, sop: 26, conf: 5, exp: 7, score: 6, res: 5 };
const pad = (s, n) =>
  String(s == null ? "" : s)
    .slice(0, n)
    .padEnd(n);
console.log(`\n===== QC ACCURACY TEST (${CASES.length} cases) =====\n`);
console.log(
  pad("domain", W.dom) +
    pad("exp-intent", W.ei) +
    pad("det-intent", W.di) +
    pad("matched SOP", W.sop) +
    pad("conf", W.conf) +
    pad("exp", W.exp) +
    pad("score", W.score) +
    "result",
);
console.log("-".repeat(100));

for (const c of CASES) {
  const det = detectIntent(c.cust);
  const m = matchSOP(c.cust, sops, { intent: det.intent });
  const r = scoreReply({
    customerText: c.cust,
    adminText: c.admin,
    responseSeconds: c.sec,
    sops,
    fatalRules,
    slaException: !!c.sla,
  });

  const intentOk = det.intent === c.intent;
  if (intentOk) intentHit++;

  let resultOk;
  if (c.expect === "fatal") resultOk = r.isFatal && r.finalScore === 0;
  else if (c.expect === "pass") resultOk = !r.isFatal && r.finalScore >= PASS;
  else resultOk = r.finalScore < PASS; // 'fail'

  resultOk ? pass++ : fail++;
  const mark = resultOk ? "✅" : "❌";
  const iMark = intentOk ? "" : "‼";

  console.log(
    pad(c.domain, W.dom) +
      pad(c.intent, W.ei) +
      pad(det.intent + iMark, W.di) +
      pad(m.sop ? m.sop.topic : "—", W.sop) +
      pad(m.confidence, W.conf) +
      pad(c.expect, W.exp) +
      pad(r.finalScore, W.score) +
      mark,
  );
}

console.log("-".repeat(100));
const intentPct = Math.round((intentHit / CASES.length) * 100);
const outcomePct = Math.round((pass / CASES.length) * 100);
console.log(`\nIntent accuracy : ${intentHit}/${CASES.length} (${intentPct}%)`);
console.log(`Outcome accuracy: ${pass}/${CASES.length} (${outcomePct}%) — pass/fail/fatal ตรงตามคาด`);
console.log(`\n===== สรุป: ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
// เกณฑ์ยอมรับ: outcome ≥ 80% และ intent ≥ 80%
process.exit(outcomePct >= 80 && intentPct >= 80 ? 0 : 1);

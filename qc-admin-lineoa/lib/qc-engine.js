const POLITE_WORDS = ['ค่ะ','ครับ','ขอบคุณ','ขออภัย','รบกวน','ยินดี','แจ้ง','ช่วย','นะคะ','นะครับ'];
const RUDE_WORDS = ['โง่','บ้า','เรื่องมาก','รำคาญ','ไม่ได้ก็ไม่ต้อง','หัดอ่าน','ทำไมไม่อ่าน'];
const EMPATHY_WORDS = ['เข้าใจ','ไม่ต้องกังวล','ขออภัย','เสียใจ','เร่งตรวจสอบ','ดูแล','ช่วยเช็ค','ขอบคุณที่แจ้ง'];
const BOT_PHRASES = ['กรุณารอสักครู่','ระบบกำลังดำเนินการ','ขออภัยในความไม่สะดวก'];

export function normalizeText(s='') { return String(s).normalize('NFKC').trim(); }

export function scoreReply({ customerText='', adminText='', responseSeconds=0, responseLimitMinutes=5, rules=[] }) {
  const c = normalizeText(customerText).toLowerCase();
  const a = normalizeText(adminText).toLowerCase();
  const limitSec = Number(responseLimitMinutes || 5) * 60;

  const speedScore = responseSeconds <= limitSec ? 100 : Math.max(0, 100 - Math.ceil((responseSeconds - limitSec) / 30) * 5);

  let polite = POLITE_WORDS.filter(w => a.includes(w)).length;
  let rude = RUDE_WORDS.filter(w => a.includes(w)).length;
  let empathy = EMPATHY_WORDS.filter(w => a.includes(w)).length;
  let sentimentScore = Math.max(0, Math.min(100, 60 + polite * 7 + empathy * 8 - rude * 30));

  let matchedRules = [];
  for (const r of rules || []) {
    const q = (r.question_keywords || []).some(k => c.includes(String(k).toLowerCase()));
    if (q) {
      const ok = (r.answer_keywords || []).some(k => a.includes(String(k).toLowerCase()));
      matchedRules.push({ code: r.rule_code, name: r.rule_name, pass: ok });
    }
  }
  const correctnessScore = matchedRules.length ? Math.round(matchedRules.filter(x=>x.pass).length / matchedRules.length * 100) : heuristicCorrectness(c, a);

  const botPenalty = BOT_PHRASES.filter(p => a.includes(p)).length >= 2 ? 15 : 0;
  const finalScore = Math.max(0, Math.round(speedScore * 0.30 + correctnessScore * 0.40 + sentimentScore * 0.30 - botPenalty));

  const failReasons = [];
  if (speedScore < 80) failReasons.push('ตอบช้ากว่า SLA');
  if (correctnessScore < 70) failReasons.push('คำตอบอาจไม่ตรงประเด็น/ไม่ครบ keyword ที่กำหนด');
  if (sentimentScore < 70) failReasons.push('น้ำเสียงหรือ service mind ต่ำ');
  if (botPenalty) failReasons.push('มี pattern ตอบเหมือนบอท/ข้อความวนซ้ำ');

  return { speedScore, correctnessScore, sentimentScore, finalScore, botPenalty, matchedRules, failReasons };
}

function heuristicCorrectness(c, a) {
  const topicMap = [
    { q:['สมัคร','register','ลงทะเบียน'], a:['สมัคร','ลิงก์','เอกสาร','เบอร์','ยืนยัน'] },
    { q:['kyc','ยืนยันตัวตน'], a:['kyc','บัตร','ยืนยัน','ตรวจสอบ','อนุมัติ'] },
    { q:['เติมเงิน','ฝากเงิน','โอน'], a:['เติม','ยอด','สลิป','บัญชี','ตรวจสอบ'] },
    { q:['โปร','โปรโมชั่น','bonus','โบนัส'], a:['โปร','เงื่อนไข','ยอด','โบนัส','ระยะเวลา'] }
  ];
  const found = topicMap.find(t => t.q.some(x => c.includes(x)));
  if (!found) return a.length > 20 ? 75 : 45;
  const hit = found.a.filter(x => a.includes(x)).length;
  return Math.min(100, 45 + hit * 15);
}

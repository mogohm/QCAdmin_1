// Intent Engine — ตรวจ intent จากข้อความลูกค้า (ไทย / อังกฤษ / ผสม)
// CommonJS เพื่อให้ใช้ได้ทั้ง Next.js (import) และ node script (require)

const INTENT_KEYWORDS = {
  // intent: [ [keyword, weight, lang], ... ]
  register: [
    ["สมัครสมาชิก", 3, "th"],
    ["สมัคร", 2, "th"],
    ["ลงทะเบียน", 2, "th"],
    ["สมาชิก", 1.5, "th"],
    ["เครดิตฟรี", 2, "th"],
    ["เพิ่มเบอร์", 2, "th"],
    ["ยืนยันข้อมูล", 1.5, "th"],
    ["สมัคร id", 2.5, "mixed"],
    ["register", 2, "en"],
    ["sign up", 2, "en"],
    ["signup", 2, "en"],
  ],
  deposit: [
    ["ฝากเงิน", 3, "th"],
    ["ฝาก", 2, "th"],
    ["เติมเงิน", 3, "th"],
    ["เติม", 1.5, "th"],
    ["โอนเงิน", 2.5, "th"],
    ["โอน", 1.5, "th"],
    ["สลิป", 2, "th"],
    ["qr code", 2, "mixed"],
    ["ลิงก์ฝาก", 2.5, "th"],
    ["bitpay", 2, "en"],
    ["deposit", 3, "en"],
    ["top up", 2, "en"],
    ["topup", 2, "en"],
  ],
  withdraw: [
    ["ถอนเงิน", 3.5, "th"],
    ["ถอน", 2.5, "th"],
    ["ลิงก์ถอน", 3, "th"],
    ["รอถอน", 2.5, "th"],
    ["ลิมิตการถอน", 3, "th"],
    ["ปิดเคสถอน", 2, "th"],
    ["withdraw", 3.5, "en"],
    ["withdrawal", 3.5, "en"],
  ],
  kyc: [
    ["ยืนยันตัวตน", 3, "th"],
    ["kyc", 3, "en"],
    ["โดนล็อค", 3, "th"],
    ["ล็อค id", 3, "mixed"],
    ["ล็อก", 2, "th"],
    ["ปลดล็อค", 3, "th"],
    ["ลืมรหัส", 3, "th"],
    ["เปลี่ยนบัญชี", 2.5, "th"],
    ["ไม่พบบัญชี", 2.5, "th"],
    ["dump chip", 2.5, "mixed"],
    ["สมัคร id ใหม่", 3, "mixed"],
    ["verify", 2, "en"],
    ["locked", 2.5, "en"],
  ],
  promotion: [
    ["โปรโมชั่น", 3, "th"],
    ["โปรโมชัน", 3, "th"],
    ["โปร", 1.5, "th"],
    ["ฮันนีมูน", 3, "th"],
    ["honeymoon", 3, "en"],
    ["แคมเปญ", 2, "th"],
    ["promotion", 3, "en"],
    ["promo", 2, "en"],
    ["campaign", 2, "en"],
  ],
  bonus: [
    ["โบนัส", 3, "th"],
    ["bonus", 3, "en"],
    ["รับเงินคืน", 2.5, "th"],
    ["เงินคืน", 2, "th"],
    ["cashback", 2.5, "en"],
    ["cash out", 1.5, "en"],
    ["เครดิต", 1.5, "th"],
  ],
  jackpot: [
    ["jackpot", 3, "en"],
    ["แจ็คพอต", 3, "th"],
    ["แจ๊คพอต", 3, "th"],
    ["leaderboard", 3, "en"],
    ["leader board", 3, "en"],
    ["bad beat", 3, "mixed"],
    ["กระดาน", 1.5, "th"],
  ],
  poker: [
    ["โป๊กเกอร์", 3, "th"],
    ["poker", 3, "en"],
    ["nlh", 2.5, "en"],
    ["plo", 2.5, "en"],
    ["aof", 2.5, "en"],
    ["all-in or fold", 3, "en"],
    ["rush & cash", 3, "mixed"],
    ["rush and cash", 3, "mixed"],
    ["cash game", 2.5, "en"],
    ["ev cashout", 2.5, "mixed"],
    ["pokercraft", 2.5, "en"],
    ["คำศัพ", 1.5, "th"],
    ["smart hud", 2.5, "mixed"],
    ["prop bet", 2.5, "mixed"],
    ["c$", 2, "en"],
    ["t$", 2, "en"],
  ],
  tournament: [
    ["ทัวร์นาเมนต์", 3, "th"],
    ["ทัวร์", 2, "th"],
    ["tournament", 3, "en"],
    ["final table", 3, "en"],
    ["pick and go", 3, "en"],
    ["pick & go", 3, "mixed"],
    ["mystery battle", 3, "en"],
    ["bubble", 2.5, "en"],
    ["บายอิน", 2.5, "th"],
    ["buy-in", 2.5, "en"],
    ["buyin", 2.5, "en"],
    ["ตั๋ว", 2, "th"],
    ["spin&gold", 3, "mixed"],
    ["spin & gold", 3, "mixed"],
    ["spin and gold", 3, "mixed"],
    ["fish buffet", 2.5, "en"],
  ],
  technical_issue: [
    ["ดาวน์โหลด", 2, "th"],
    ["download", 2, "en"],
    ["สเปค", 2, "th"],
    ["ปุ่มลัด", 2, "th"],
    ["nft", 2, "en"],
    ["ปิดระบบ", 2.5, "th"],
    ["ปิดปรับปรุง", 2.5, "th"],
    ["ดีเลย์", 1.8, "th"],
    ["delay", 1.8, "en"],
    ["ขัดข้อง", 2, "th"],
    ["ทัวร์ล่ม", 2.5, "th"],
    ["ล่ม", 1.5, "th"],
    ["เข้าเกมไม่ได้", 2.5, "th"],
    ["error", 1.8, "en"],
    ["ระบบล่ม", 2.5, "th"],
    ["บันทึก qr", 2.5, "mixed"],
    ["ios", 1.5, "en"],
    ["android", 1.5, "en"],
  ],
  escalation: [
    ["live chat", 3, "en"],
    ["livechat", 3, "en"],
    ["ติดต่อทีมงาน", 2.5, "th"],
    ["ประสานงาน", 2, "th"],
    ["escalate", 3, "en"],
    ["support team", 2.5, "en"],
    ["ติดต่อซัพพอร์ต", 2.5, "th"],
  ],
  closing: [
    ["ปิดเคส", 2.5, "th"],
    ["เรียบร้อยค่ะ", 2, "th"],
    ["completed", 2, "en"],
    ["รอสักครู่", 1.5, "th"],
    ["แจ้งรอ", 2, "th"],
    ["waiting for the system", 2.5, "en"],
    ["done", 1.2, "en"],
  ],
};

const INTENTS = Object.keys(INTENT_KEYWORDS);

function normalize(s = "") {
  return String(s).normalize("NFKC").toLowerCase().trim();
}

// ตรวจ intent: คืน intent ที่คะแนนสูงสุด + confidence 0-100 + คะแนนทุก intent
function detectIntent(text = "") {
  const t = normalize(text);
  if (!t) return { intent: "general", confidence: 0, scores: {}, matched: [] };

  const scores = {};
  const matched = [];
  for (const intent of INTENTS) {
    let s = 0;
    for (const [kw, w] of INTENT_KEYWORDS[intent]) {
      if (t.includes(normalize(kw))) {
        s += w;
        matched.push({ intent, keyword: kw, weight: w });
      }
    }
    if (s > 0) scores[intent] = +s.toFixed(2);
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length)
    return { intent: "general", confidence: 0, scores: {}, matched: [] };

  const [bestIntent, bestScore] = ranked[0];
  // confidence: คะแนนเด่นชัดแค่ไหน (เทียบกับ threshold ~3 + ห่างอันดับ 2)
  const second = ranked[1] ? ranked[1][1] : 0;
  const dominance = bestScore / (bestScore + second || 1); // 0.5-1
  const strength = Math.min(1, bestScore / 4); // อิ่มตัวที่ ~4
  const confidence = Math.round(
    Math.min(100, (strength * 0.6 + dominance * 0.4) * 100),
  );

  return {
    intent: bestIntent,
    confidence,
    scores,
    matched: matched.filter((m) => m.intent === bestIntent),
  };
}

module.exports = { INTENTS, INTENT_KEYWORDS, detectIntent, normalize };

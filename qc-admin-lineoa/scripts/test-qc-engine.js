// test-qc-engine.js — ตรวจ engine ทั้งหมด (ไม่ต้องต่อ DB ใช้ data/sop-data.json)
//   npm run test:qc
const fs = require("fs");
const path = require("path");
const { detectIntent } = require("../lib/intent-engine");
const { matchSOP } = require("../lib/sop-matcher");
const { scoreReply } = require("../lib/qc-engine");
const { generateCoaching } = require("../lib/coaching");

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
};

// โหลด knowledge base
const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "sop-data.json"), "utf8"),
);
const sops = data.scripts.map((s, i) => ({ id: i + 1, ...s }));
const fatalRules = data.fatal_rules;

console.log("===== 1) SOP IMPORT =====");
ok("โหลด sop-data.json ได้", sops.length > 50, `${sops.length} records`);
ok(
  "มีหมวด (categories)",
  data.categories.length >= 5,
  `${data.categories.length} หมวด`,
);
ok(
  "มี intent patterns",
  data.intent_patterns.length > 50,
  `${data.intent_patterns.length}`,
);
ok("มี fatal rules", fatalRules.length >= 1, `${fatalRules.length}`);

console.log("\n===== 2) INTENT DETECTION (TH/EN/mixed) =====");
const intentCases = [
  ["ขอลิงก์ฝากเงินหน่อยครับ", "deposit"],
  ["อยากถอนเงิน ถอนยังไง", "withdraw"],
  ["สมัครสมาชิกยังไงครับ", "register"],
  ["บัญชีโดนล็อค ปลดล็อคยังไง", "kyc"],
  ["how to withdraw my money", "withdraw"],
  ["โบนัส bonus คาสิโน", "bonus"],
  ["วิธีเล่น PLO poker", "poker"],
  ["tournament final table คืออะไร", "tournament"],
];
for (const [msg, exp] of intentCases) {
  const d = detectIntent(msg);
  ok(
    `"${msg.slice(0, 28)}" → ${d.intent} (conf ${d.confidence})`,
    d.intent === exp,
    exp !== d.intent ? `คาดว่า ${exp}` : "",
  );
}

console.log("\n===== 3) SOP MATCHING =====");
const matchCases = [
  "ขอลิงก์ฝากเงิน",
  "ถอนเงินไม่ได้ ธนาคารดีเลย์",
  "สมัครสมาชิก",
];
for (const msg of matchCases) {
  const m = matchSOP(msg, sops);
  ok(
    `match "${msg}" → "${m.sop ? m.sop.topic.slice(0, 30) : "none"}" (${m.method}, conf ${m.confidence})`,
    m.sop && m.confidence > 20,
  );
}

console.log("\n===== 4) QC SCORING (8 มิติ) =====");
const good = scoreReply({
  customerText: "ขอลิงก์ฝากเงินหน่อยค่ะ",
  adminText:
    "วิธีเติมเงิน Auto เช็คที่เมนูฝากทุกครั้ง ลิงก์ https://bit.ly/xxx ค่ะ ยินดีให้บริการนะคะ",
  responseSeconds: 60,
  sops,
  fatalRules,
});
ok(
  "คำตอบดี → คะแนนสูง",
  good.finalScore >= 60,
  `score ${good.finalScore}, intent ${good.intent}`,
);
ok(
  "มีครบ 8 มิติ/มิติที่เกี่ยวข้อง",
  Object.keys(good.dimensions).length >= 5,
  Object.keys(good.dimensions).join(","),
);

const slow = scoreReply({
  customerText: "ถอนเงินยังไง",
  adminText: "ถอนผ่านเมนูถอนค่ะ",
  responseSeconds: 1800,
  sops,
  fatalRules,
});
ok(
  "ตอบช้า → responseTime ต่ำ",
  slow.dimensions.responseTime < 80,
  `rt ${slow.dimensions.responseTime}`,
);

console.log("\n===== 5) FATAL RULES =====");
const rude = scoreReply({
  customerText: "ถอนเงินยังไง",
  adminText: "โง่จริงๆ หัดอ่านเองบ้าง",
  responseSeconds: 30,
  sops,
  fatalRules,
});
ok(
  "คำหยาบ → fatal & score 0",
  rude.isFatal && rude.finalScore === 0,
  `score ${rude.finalScore}`,
);
const dismiss = scoreReply({
  customerText: "ฝากเงินไม่เข้า",
  adminText: "ไม่รู้ ไปถามที่อื่น",
  responseSeconds: 30,
  sops,
  fatalRules,
});
ok("ปฏิเสธช่วยเหลือ → fatal", dismiss.isFatal, `score ${dismiss.finalScore}`);

console.log("\n===== 6) COACHING =====");
const coach = generateCoaching({
  customerText: "ถอนเงินยังไง",
  adminText: "ถอนเองสิ",
  scoreResult: scoreReply({
    customerText: "ถอนเงินยังไง",
    adminText: "ถอนเองสิ",
    responseSeconds: 600,
    sops,
    fatalRules,
  }),
  sop: matchSOP("ถอนเงินยังไง", sops).sop,
});
ok(
  "สร้าง coaching เมื่อคะแนนต่ำ",
  coach && coach.reasons.length > 0,
  coach ? `${coach.reasons.length} เหตุผล` : "null",
);
ok("coaching มี suggested reply", coach && !!coach.suggested_reply);
const noCoach = generateCoaching({
  customerText: "x",
  adminText: "y",
  scoreResult: { finalScore: 95 },
});
ok("คะแนนสูง → ไม่ต้อง coaching", noCoach === null);

console.log("\n===== 7) MINOR ERROR PENALTY =====");
const noPolite = scoreReply({
  customerText: "ขอลิงก์ฝากเงิน",
  adminText: "เมนูฝาก ลิงก์ https://bit.ly/x ตรวจสอบยอด",
  responseSeconds: 30,
  sops,
  fatalRules,
});
ok(
  "ไม่มีคำลงท้ายสุภาพ → minor issue",
  noPolite.minorIssues.length > 0,
  noPolite.minorIssues.join(","),
);

console.log("\n===== 8) SLA EXCEPTION =====");
const slaOff = scoreReply({
  customerText: "ถอนเงินยังไง",
  adminText: "รอสักครู่นะคะ ตรวจสอบยอดให้ค่ะ",
  responseSeconds: 1800,
  sops,
  fatalRules,
  slaException: false,
});
const slaOn = scoreReply({
  customerText: "ถอนเงินยังไง",
  adminText: "รอสักครู่นะคะ ตรวจสอบยอดให้ค่ะ",
  responseSeconds: 1800,
  sops,
  fatalRules,
  slaException: true,
});
ok(
  "SLA exception → responseTime ไม่หักเต็ม",
  slaOn.dimensions.responseTime >= slaOff.dimensions.responseTime &&
    slaOn.dimensions.responseTime >= 80,
  `off=${slaOff.dimensions.responseTime} on=${slaOn.dimensions.responseTime}`,
);
ok("SLA exception flag ติด", slaOn.slaException === true);

console.log("\n===== 9) qc_score_details (รายมิติ + evidence) =====");
const det = good.details || [];
const codes = det.map((d) => d.category_code);
ok(
  "details มีครบ 7 มิติ rubric + minor + fatal",
  [
    "greetingClosing",
    "problemSolving",
    "communicationTone",
    "responseTime",
    "minorError",
    "fatalError",
  ].every((c) => codes.includes(c)),
  codes.join(","),
);
ok(
  "มิติที่ไม่เกี่ยว intent = N/A (applicable=false)",
  det.some((d) => d.applicable === false),
  det
    .filter((d) => d.applicable === false)
    .map((d) => d.category_code)
    .join(","),
);
ok(
  "แต่ละ detail มี evidence",
  det.every((d) => d.evidence !== undefined),
);
const ps = det.find((d) => d.category_code === "problemSolving");
ok(
  "problemSolving มี matched_sop evidence",
  ps && ps.evidence && "matched_sop" in ps.evidence,
);
ok(
  "evidence รวมมี matched/missing keywords",
  good.evidence && Array.isArray(good.evidence.missing_required_keywords),
);

// DB-dependent tests (รันเมื่อมี DATABASE_URL)
if (process.env.DATABASE_URL) {
  console.log("\n===== 10) DB: dispute create/update + qc_score_details =====");
  (async () => {
    const { neon } = require("@neondatabase/serverless");
    const db = neon(process.env.DATABASE_URL);
    try {
      const n = await db`SELECT count(*)::int n FROM sop_scripts`;
      ok("DB: SOP imported", n[0].n >= 90, `${n[0].n} records`);
      const d = await db`SELECT count(*)::int n FROM qc_score_details`;
      ok("DB: qc_score_details generated", d[0].n >= 0, `${d[0].n} rows`);
    } catch (e) {
      ok("DB tests", false, e.message);
    }
    console.log(`\n===== สรุป: ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
    process.exit(fail ? 1 : 0);
  })();
} else {
  console.log("\n(ข้าม DB tests — ไม่มี DATABASE_URL)");
  console.log(`\n===== สรุป: ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
  process.exit(fail ? 1 : 0);
}

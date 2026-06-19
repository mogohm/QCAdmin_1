// test-admin-reply.js — ตรวจ contract ของ /api/admin/reply (engine pipeline)
//   npm run test:admin-reply
const fs = require("fs");
const path = require("path");
const { scoreReply } = require("../lib/qc-engine");
const { generateCoaching } = require("../lib/coaching");

let pass = 0,
  fail = 0;
const ok = (n, c, e = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "✅" : "❌"} ${n}${e ? " — " + e : ""}`);
};

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "sop-data.json"), "utf8"),
);
const sopScripts = data.scripts.map((s, i) => ({ id: i + 1, ...s }));
const fatalRules = data.fatal_rules;

console.log("===== 1) signature: sopScripts alias + systemEvents =====");
const r1 = scoreReply({
  customerText: "ขอลิงก์ฝากเงิน",
  adminText: "วิธีเติมเงิน Auto ลิงก์ https://bit.ly/x ค่ะ",
  responseSeconds: 40,
  sopScripts,
  fatalRules,
});
ok(
  "รับ sopScripts (alias ของ sops)",
  r1.matchedSop && r1.intent === "deposit",
  `intent=${r1.intent}`,
);

const evActive = [
  {
    affects_sla: true,
    is_active: true,
    starts_at: new Date(Date.now() - 3600e3).toISOString(),
    ends_at: new Date(Date.now() + 3600e3).toISOString(),
  },
];
const r2 = scoreReply({
  customerText: "ถอนเงินยังไง",
  adminText: "รอสักครู่นะคะ ตรวจสอบยอดให้ค่ะ",
  responseSeconds: 1800,
  sopScripts,
  fatalRules,
  systemEvents: evActive,
});
ok("systemEvents active → sla_exception=true", r2.slaException === true);
ok(
  "systemEvents → responseTime ไม่หักเต็ม (≥80)",
  r2.dimensions.responseTime >= 80,
  `rt=${r2.dimensions.responseTime}`,
);
const r2b = scoreReply({
  customerText: "ถอนเงินยังไง",
  adminText: "รอสักครู่นะคะ",
  responseSeconds: 1800,
  sopScripts,
  fatalRules,
  systemEvents: [],
});
ok("ไม่มี event → ไม่ยกเว้น", r2b.slaException === false);

console.log("\n===== 2) insert fields ครบ (qc_scores) =====");
const need = [
  "finalScore",
  "intent",
  "matchedSop",
  "sopConfidence",
  "dimensions",
  "evidence",
  "isFatal",
  "minorIssues",
  "slaException",
  "fatalReasons",
  "failReasons",
  "details",
  "commissionTier",
];
for (const f of need) ok(`มี field: ${f}`, r1[f] !== undefined);
ok(
  "matchedSop มี id + topic (matched_sop_id/topic)",
  !!(r1.matchedSop?.id && r1.matchedSop?.topic),
);
ok(
  "evidence มี matched/missing keywords",
  Array.isArray(r1.evidence.missing_required_keywords),
);

console.log("\n===== 3) qc_score_details ทุก dimension =====");
const codes = (r1.details || []).map((d) => d.category_code);
ok(
  "details ครบ 7 rubric + minor + fatal",
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
  "แต่ละ detail มี raw/weighted/max/pass/evidence",
  (r1.details || []).every(
    (d) =>
      "raw_score" in d &&
      "weighted_score" in d &&
      "max_score" in d &&
      "pass" in d &&
      "evidence" in d,
  ),
);

console.log("\n===== 4) fatal/minor + coaching =====");
const rf = scoreReply({
  customerText: "ถอนเงิน",
  adminText: "โง่จริงๆ หัดอ่านเองบ้าง",
  responseSeconds: 30,
  sopScripts,
  fatalRules,
});
ok("คำหยาบ → is_fatal + score 0", rf.isFatal && rf.finalScore === 0);
ok("fatal_reasons ไม่ว่าง", (rf.fatalReasons || []).length > 0);
const rc = generateCoaching({
  customerText: "ถอนเงิน",
  adminText: "ถอนเองสิ",
  scoreResult: scoreReply({
    customerText: "ถอนเงิน",
    adminText: "ถอนเองสิ",
    responseSeconds: 600,
    sopScripts,
    fatalRules,
  }),
  sop: r1.matchedSop,
});
ok("coaching สร้างได้เมื่อคะแนนต่ำ", rc && rc.reasons.length > 0);

console.log(`\n===== สรุป: ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
process.exit(fail ? 1 : 0);

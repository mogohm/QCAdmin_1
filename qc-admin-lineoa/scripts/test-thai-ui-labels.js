// test-thai-ui-labels.js — กันไม่ให้ raw key / label อังกฤษที่อ่านไม่เข้าใจหลุดบน UI
//   สแกนไฟล์ UI (app/ ยกเว้น app/api ซึ่งเป็น data layer) — lib/ui-labels.js เป็น map กลาง (ยกเว้น)
//   อนุญาต: KYC, SOP, AI, QC
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "app");
let pass = 0,
  fail = 0;
const violations = [];

// raw category key ที่ห้ามโชว์บน UI
const RAW_KEYS = [
  "creditDepositWithdraw",
  "problemSolving",
  "greetingClosing",
  "communicationTone",
  "responseTime",
  "upsellPromotion",
  "minorError",
  "fatalError",
  "[object Object]",
];
// label อังกฤษที่อ่านแล้วงง (ต้องเป็นไทย) — regex ตรงคำ
//   อนุญาต: KYC, SOP, AI, QC, LINE OA
const CONFUSING = [
  /\bRESP\b/,
  /\bBAD\b/,
  /\bAVG QA\b/i,
  /Team Average & Trend/,
  /Bottleneck Analysis/,
  /Skill Radar/,
  /AI Coaching/,
  /Total Cases/,
  /Error Cases/,
  /Estimated Commission/,
  /Intent Distribution/,
  /Commission Tiers/,
  /Greeting\/Closing/,
  /Problem Solving/,
  /Deposit\/WD/,
  /Marketing —/,
  /AI QC PROGRAM · QC MONITORING/,
  /\bFATAL\b/,
];

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // ข้าม app/api (data layer — อนุญาต raw key ใน SQL/JSON)
      if (path.relative(APP, full).replace(/\\/g, "/").startsWith("api"))
        continue;
      out.push(...walk(full));
    } else if (e.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(APP);
for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const k of RAW_KEYS) {
      if (line.includes(k)) violations.push(`${rel}:${i + 1} raw key "${k}"`);
    }
    for (const re of CONFUSING) {
      if (re.test(line))
        violations.push(
          `${rel}:${i + 1} label อังกฤษ "${(line.match(re) || [])[0]}"`,
        );
    }
  });
}

console.log(
  `== Thai UI labels — สแกน ${files.length} ไฟล์ UI (ยกเว้น app/api) ==`,
);
if (violations.length) {
  fail = violations.length;
  for (const v of violations) console.log(`❌ ${v}`);
} else {
  pass = 1;
  console.log("✅ ไม่มี raw key / label อังกฤษที่อ่านไม่เข้าใจบน UI");
}

console.log(
  `\n===== Thai UI: ${fail ? "❌ FAIL" : "✅ PASS"} — พบปัญหา ${fail} จุด =====`,
);
process.exit(fail ? 1 : 0);

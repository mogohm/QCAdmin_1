// test-thai-ui-labels.js — กันไม่ให้ raw key / label อังกฤษที่อ่านไม่เข้าใจหลุดบน UI
//   สแกน: app/ (ยกเว้น app/api = data layer) + lib/ (ยกเว้นไฟล์ mapping/config ที่อนุญาต)
//   ไฟล์ที่ยกเว้น: lib/ui-labels.js (map กลาง), lib/qc-engine.js (rubric config)
//   คำที่อนุญาต: AI, QC, SOP, KYC, LINE OA
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "app");
const LIB = path.join(ROOT, "lib");
// ไฟล์ mapping/config ที่อนุญาตให้มี raw key ได้ (ไม่ใช่ UI แสดงผล)
const ALLOW_FILES = ["lib/ui-labels.js", "lib/qc-engine.js"];
let pass = 0,
  fail = 0;
const violations = [];

// ===== คำผู้ใช้เห็นต้องห้าม (ตรวจทั้ง app/ และ lib/) =====
//   literal substring — รวม [object Object]
const BAN_LITERAL = ["[object Object]"];
//   regex คำ/วลีที่ผู้ใช้เห็นแล้วงง (จากรายการ tester)
const BAN_DISPLAY = [
  /Fatal\/Minor/,
  /Tier คะแนน QA/,
  /QA Coverage/,
  /\bAVG QA\b/i,
  /Total Cases/,
  /Error Cases/,
  /Estimated Commission/,
  /Skill Radar/,
  /Team Average & Trend/,
  /Bottleneck Analysis/,
  /Intent Distribution/,
  /Commission Tiers/,
  /Greeting\/Closing/,
  /Problem Solving/,
  /Deposit\/WD/,
  /\bRESP\b/,
  /\bBAD\b/,
];

// ===== ตรวจเฉพาะไฟล์ UI (app/ ยกเว้น api) — JSX/หน้าจอ =====
//   raw category key (camelCase) / template เวลา — ห้ามแสดงบน JSX (แต่เป็น key ใน lib ได้)
const UI_RAW_KEYS = [
  "creditDepositWithdraw",
  "problemSolving",
  "greetingClosing",
  "communicationTone",
  "responseTime",
  "upsellPromotion",
  "minorError",
  "fatalError",
  "${s}s", // เวลาต้องใช้ formatDuration ไม่ใช่ 50s
  "${Math.floor(s / 60)}m",
];
const UI_DISPLAY = [
  /AI Coaching/,
  /Marketing —/,
  /AI QC PROGRAM · QC MONITORING/,
  /\bFATAL\b/,
  /\bTier\b/,
  />\d+s</, // JSX เวลา 50s hardcode
  />\d+m</, // JSX เวลา 1m hardcode
];

function walk(dir, skipApi = false) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // ข้าม app/api (data layer — อนุญาต raw key ใน SQL/JSON)
      if (
        skipApi &&
        path.relative(APP, full).replace(/\\/g, "/").startsWith("api")
      )
        continue;
      out.push(...walk(full, skipApi));
    } else if (e.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

// สแกน app/ (ยกเว้น api) + lib/ (ยกเว้นไฟล์ mapping/config)
const files = [...walk(APP, true), ...walk(LIB)].filter(
  (f) => !ALLOW_FILES.includes(path.relative(ROOT, f).replace(/\\/g, "/")),
);
for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const isUI = rel.startsWith("app/"); // ไฟล์ UI (JSX) — ตรวจเข้มกว่า lib/
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    // ตรวจทุกไฟล์: คำผู้ใช้เห็นต้องห้าม
    for (const k of BAN_LITERAL) {
      if (line.includes(k)) violations.push(`${rel}:${i + 1} "${k}"`);
    }
    for (const re of BAN_DISPLAY) {
      if (re.test(line))
        violations.push(
          `${rel}:${i + 1} คำอังกฤษ "${(line.match(re) || [])[0]}"`,
        );
    }
    // ตรวจเฉพาะ UI (app/): raw key บน JSX + คำ UI เฉพาะ
    if (isUI) {
      for (const k of UI_RAW_KEYS) {
        if (line.includes(k)) violations.push(`${rel}:${i + 1} raw key "${k}"`);
      }
      for (const re of UI_DISPLAY) {
        if (re.test(line))
          violations.push(
            `${rel}:${i + 1} คำอังกฤษ "${(line.match(re) || [])[0]}"`,
          );
      }
    }
  });
}

console.log(
  `== Thai UI labels — สแกน ${files.length} ไฟล์ (app/ ยกเว้น api + lib/ ยกเว้น mapping) ==`,
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

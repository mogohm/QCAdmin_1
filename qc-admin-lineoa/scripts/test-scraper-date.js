// test-scraper-date.js — ตรวจการแปลง date label ของ chat list (Today/Yesterday/weekday/รูปแบบวันที่)
//   npm run test:scraper  (ส่วนที่ 1)
const fs = require("fs");
const path = require("path");
const { dayLabelToDate } = require("../lib/scraper-core");

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
};

// now คงที่เพื่อให้ผลทดสอบ deterministic
const NOW = new Date(2026, 5, 17, 12, 0, 0); // 17 มิ.ย. 2026
const midnight = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};
const today = midnight(NOW);
const DAY = 86400000;

console.log("===== 1) Today / Yesterday / เวลา =====");
ok('"Today" → วันนี้', midnight(dayLabelToDate("Today", NOW)) === today);
ok('"วันนี้" → วันนี้', midnight(dayLabelToDate("วันนี้", NOW)) === today);
ok('"11:20" (เวลา) → วันนี้', midnight(dayLabelToDate("11:20", NOW)) === today);
ok('"Yesterday" → เมื่อวาน', midnight(dayLabelToDate("Yesterday", NOW)) === today - DAY);
ok('"เมื่อวาน" → เมื่อวาน', midnight(dayLabelToDate("เมื่อวาน", NOW)) === today - DAY);

console.log("\n===== 2) ชื่อวัน (TH/EN) → วันล่าสุดในอดีต =====");
const weekdayCases = [
  ["Monday", 1],
  ["Tuesday", 2],
  ["Wednesday", 3],
  ["Thursday", 4],
  ["Friday", 5],
  ["Saturday", 6],
  ["Sunday", 0],
  ["จันทร์", 1],
  ["พุธ", 3],
  ["ศุกร์", 5],
  ["อาทิตย์", 0],
];
for (const [label, dayNum] of weekdayCases) {
  const d = dayLabelToDate(label, NOW);
  const okDay = d && d.getDay() === dayNum;
  const inPast = d && midnight(d) < today && midnight(d) >= today - 7 * DAY;
  ok(`"${label}" → getDay=${dayNum} + เป็นอดีตภายใน 7 วัน`, okDay && inPast, d ? d.toDateString() : "null");
}

console.log("\n===== 3) รูปแบบวันที่ =====");
const dateCases = [
  ["13/05/2026", 2026, 4, 13], // D/M (13>12)
  ["5/13/2026", 2026, 4, 13], // M/D (13>12)
  ["2026-05-13", 2026, 4, 13], // ISO
  ["May 20, 2026", 2026, 4, 20], // month name + year
];
for (const [label, y, mo, day] of dateCases) {
  const d = dayLabelToDate(label, NOW);
  const match = d && d.getFullYear() === y && d.getMonth() === mo && d.getDate() === day;
  ok(
    `"${label}" → ${y}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    match,
    d ? d.toDateString() : "null",
  );
}
ok(
  '"May 20" (ไม่มีปี) → เดือน 4 วัน 20',
  (() => {
    const d = dayLabelToDate("May 20", NOW);
    return d && d.getMonth() === 4 && d.getDate() === 20;
  })(),
);

console.log("\n===== 4) จาก fixture line-chat-date-labels.html =====");
const html = fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "line-chat-date-labels.html"), "utf8");
const items = [...html.matchAll(/data-label="([^"]+)"(?:[^>]*data-iso="([^"]+)")?/g)];
ok("อ่าน fixture เจอ label", items.length >= 12, `${items.length} items`);
let isoOk = 0,
  isoTotal = 0;
for (const m of items) {
  const label = m[1];
  const iso = m[2];
  const d = dayLabelToDate(label, NOW);
  ok(`fixture "${label}" → แปลงเป็น Date ได้`, d instanceof Date && !isNaN(d.getTime()));
  if (iso) {
    isoTotal++;
    const got = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      : null;
    if (got === iso) isoOk++;
  }
}
ok("วันที่ที่ระบุ data-iso ตรงทั้งหมด", isoOk === isoTotal, `${isoOk}/${isoTotal}`);

console.log(`\n===== สรุป: ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
process.exit(fail ? 1 : 0);

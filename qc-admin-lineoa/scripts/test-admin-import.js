// test-admin-import.js — ตรวจ PK detection (emoji/unicode/decorative) ผ่าน lib/admin-name
//   npm run test:admin-import
const { isPkName, normalizeAdminName } = require("../lib/admin-name");

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
};

console.log("===== PK names (ต้อง KEEP) =====");
const keep = [
  "PK",
  "pk",
  "PK-",
  "PK_",
  "PK-PANG",
  "PK Fern",
  "PK - บีท",
  "PK - ชื่อไทย",
  "ᴘᴋ - ᴋᴏɴɢ", // small caps
  "🅿🅺 - Game", // enclosed alphanumerics emoji
  "𝙿𝙺-Mng", // math monospace
  "ℙ𝕂 - X", // double-struck
  "꧁PK - Game꧂", // decorative
  "꧁✮𝓟𝓚 - 𝓕𝓸𝓾𝓻✮꧂", // bold-script + decorative
  "PK_HMON", // underscore
  "PK-Mos🐻❤️🔥", // มี emoji ต่อท้าย
];
for (const n of keep)
  ok(`KEEP "${n}"`, isPkName(n), `norm=${normalizeAdminName(n).slice(0, 10)}`);

console.log("\n===== ไม่ใช่ PK (ต้อง SKIP) =====");
const skip = [
  "Download",
  "Auto-response",
  "Read",
  "logo",
  "(hourglass not done)",
  "ANne",
  "HARP",
  "TEEW",
  "QC Test Bot",
  "ยอดเงินกำลังอัปเดต",
  "The photo in the message",
  "N-Nick",
  "FOMYFOAM895",
];
for (const n of skip) ok(`SKIP "${n}"`, !isPkName(n));

console.log("\n===== import result shape (simulate) =====");
// จำลอง logic การกรอง (เหมือนใน app/api/admin/import)
const lines = [...keep, ...skip, "PK-PANG" /* duplicate */];
const seen = new Set();
let imported = 0,
  skipped = 0,
  duplicated = 0;
for (const name of lines) {
  if (!isPkName(name)) {
    skipped++;
    continue;
  }
  const norm = normalizeAdminName(name).toLowerCase();
  if (seen.has(norm)) {
    duplicated++;
    continue;
  }
  seen.add(norm);
  imported++;
}
// PK และ pk normalize เหมือนกัน (admin คนเดียว) → dedup 1 ตัว
ok(
  "imported = PK unique (PK≡pk dedup)",
  imported === keep.length - 1,
  `imported=${imported}/${keep.length}`,
);
ok("skipped = จำนวน non-PK", skipped === skip.length, `skipped=${skipped}`);
ok(
  "duplicated ≥ 2 (PK-PANG ซ้ำ + PK≡pk)",
  duplicated >= 2,
  `duplicated=${duplicated}`,
);

console.log(`\n===== สรุป: ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
process.exit(fail ? 1 : 0);

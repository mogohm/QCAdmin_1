// test-evidence-badge.js — ป้าย "มีภาพ" ต้องมาจากจำนวน "ภาพ" เท่านั้น (ห้ามใช้ evidence_count)
//   บั๊กจริงที่จับ: เคสมี late_response/raw_json/chat_text/summary_json 4 รายการ (ไม่มีภาพเลย)
//   แต่ AI Review โชว์ "มีภาพ" เพราะเช็ค evidence_count > 0
const { countEvidence, screenshotBadge, isImageEvidence } = require("../lib/evidence-integrity");

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); };

console.log("===== เคส A: 4 ข้อมูลประกอบ ไม่มีภาพเลย (บั๊กจริงจาก production) =====");
{
  const rows = [
    { evidence_type: "late_response" },
    { evidence_type: "raw_json" },
    { evidence_type: "chat_text" },
    { evidence_type: "summary_json" },
  ];
  const c = countEvidence(rows, 0);
  ok("evidence_count = 4", c.evidence_count === 4);
  ok("screenshot_count = 0", c.screenshot_count === 0);
  ok("verified_screenshot_count = 0", c.verified_screenshot_count === 0);
  ok("supporting_records = 4", c.supporting_records === 4);
  const b = screenshotBadge(c);
  ok('ป้าย = "ไม่มีภาพ" (test นี้ต้อง FAIL ถ้า UI บอก "มีภาพ")', b.label === "ไม่มีภาพ", b.label);
  ok("ไม่ใช่ ✅/⚠️", b.key === "none");
}

console.log("\n===== เคส B: summary_json + pair_focus_png (verified exact) =====");
{
  const rows = [
    { evidence_type: "summary_json" },
    { evidence_type: "pair_focus_png", verification_status: "verified", match_status: "exact", url: "https://x/y.png" },
  ];
  const c = countEvidence(rows, 0);
  ok("evidence_count = 2", c.evidence_count === 2);
  ok("screenshot_count = 1", c.screenshot_count === 1);
  ok("verified_screenshot_count = 1", c.verified_screenshot_count === 1);
  const b = screenshotBadge(c);
  ok('ป้าย = "✅ มีภาพตรงเคส"', b.label === "✅ มีภาพตรงเคส", b.label);
}

console.log("\n===== เคส C: มีภาพแต่ยังไม่ verified → อ้างอิง ไม่ใช่ตรงเคส =====");
{
  const rows = [
    { evidence_type: "chat_panel_png", match_status: "legacy_unlinked" },
    { evidence_type: "summary_json" },
  ];
  const c = countEvidence(rows, 0);
  ok("verified = 0 แต่ reference = 1", c.verified_screenshot_count === 0 && c.reference_screenshot_count === 1);
  ok('ป้าย = "⚠️ มีภาพอ้างอิง"', screenshotBadge(c).label === "⚠️ มีภาพอ้างอิง");
}

console.log("\n===== เคส D: ภาพจาก conversation อื่น (refImageCount) → อ้างอิง =====");
{
  const c = countEvidence([{ evidence_type: "summary_json" }], 3);
  ok("reference = 3 (จาก conversation)", c.reference_screenshot_count === 3);
  ok('ป้าย = "⚠️ มีภาพอ้างอิง"', screenshotBadge(c).label === "⚠️ มีภาพอ้างอิง");
}

console.log("\n===== ชนิดภาพครบตาม contract =====");
for (const t of ["pair_focus_png", "pair_context_png", "chat_identity_png", "chat_header_png", "chat_panel_png", "chat_part_png", "chat_long_png", "screenshot"])
  ok(`${t} = ภาพ`, isImageEvidence(t) === true);
for (const t of ["late_response", "raw_json", "chat_text", "summary_json", "html_snapshot"])
  ok(`${t} = ไม่ใช่ภาพ`, isImageEvidence(t) === false);

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ผ่าน ${pass} / ล้มเหลว ${fail}`);
process.exit(fail === 0 ? 0 : 1);

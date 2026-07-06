// test-scraper-exact-date.js — ตรวจ "หลักการเก็บข้อมูลตามวันที่ที่เลือกเป๊ะ"
//   npm run test:scraper  (ส่วนสุดท้าย)
//   สถานการณ์อ้างอิง: วันนี้ = 2026-07-06, วันที่เลือก = 2026-07-05 (Asia/Bangkok)
//     - ห้อง A: active วันนี้ แต่มีประวัติ 07-05 → เป็น candidate, เก็บเฉพาะ 07-05
//     - ห้อง B: ล่าสุด 07-05 → เก็บ
//     - ห้อง C: ล่าสุด 07-04 → ไม่ผ่านช่วง (นอกเป้าหมาย)
//     - ลูกค้าอย่างเดียว (ไม่มีแอดมินตอบ) → ต้องถูกเก็บ + pending_reply
//     - แอดมินตอบ → เกิดคู่ QC
const D = require("../lib/scraper-date");
const core = require("../lib/scraper-core");

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
};

const TODAY = "2026-07-06";
const SEL = "2026-07-05";

// เวลาแบบ UTC ที่ตรงกับวัน Bangkok ที่ต้องการ (Bangkok = UTC+7)
//   07-05 กลางวันไทย = 07-05T05:00:00Z ; 07-05 ดึกไทย 21:31 = 07-05T14:31:00Z
//   *กับดัก timezone*: 07-05T21:31:00Z จริง ๆ คือ 07-06 04:31 เวลาไทย → ต้องถูกกันออก
const at = (d, hhmmBkk) => {
  // สร้าง ISO UTC จากวัน+เวลาไทย
  return `${d}T${hhmmBkk}:00+07:00`;
};

console.log("===== 1) validateScrapeRange: วันนี้/อนาคตต้องถูกบล็อก =====");
{
  // จำลอง "วันนี้จริง" ด้วยการเทียบกับ D.bangkokToday() — ทดสอบเชิงตรรกะด้วยค่าคงที่
  const y = D.bangkokYesterday();
  const t = D.bangkokToday();
  ok("เลือกเมื่อวาน → ok", D.validateScrapeRange(y, y).ok === true);
  ok(
    "เลือกวันนี้ → ถูกบล็อก",
    D.validateScrapeRange(t, t).ok === false,
    D.validateScrapeRange(t, t).error,
  );
  const tomorrow = new Date(Date.now() + 2 * 86400000)
    .toISOString()
    .slice(0, 10);
  ok("เลือกอนาคต → ถูกบล็อก", D.validateScrapeRange(tomorrow, tomorrow).ok === false);
  ok("from > to → ถูกบล็อก", D.validateScrapeRange(y, "2000-01-01").ok === false);
  ok("รูปแบบผิด (parse ไม่ได้) → ถูกบล็อก", D.validateScrapeRange("notadate").ok === false);
}

console.log("\n===== 2) messageInTargetRange: กัน 'วันนี้' รั่วเข้าเป้าหมาย =====");
{
  ok(
    "07-05 กลางวันไทย → อยู่ในเป้าหมาย 07-05",
    D.messageInTargetRange(at(SEL, "12:00"), SEL, SEL) === true,
  );
  ok(
    "07-05 ดึกไทย 23:31 → ยังเป็น 07-05 (อยู่ในเป้าหมาย)",
    D.messageInTargetRange(at(SEL, "23:31"), SEL, SEL) === true,
  );
  ok(
    "07-05T21:31Z (=07-06 04:31 ไทย) → ถูกกันออกจากเป้าหมาย 07-05",
    D.messageInTargetRange("2026-07-05T21:31:00Z", SEL, SEL) === false,
  );
  ok(
    "วันนี้ 07-06 → ไม่อยู่ในเป้าหมาย 07-05",
    D.messageInTargetRange(at(TODAY, "10:00"), SEL, SEL) === false,
  );
  ok(
    "07-04 → ไม่อยู่ในเป้าหมาย 07-05 (single day)",
    D.messageInTargetRange(at("2026-07-04", "10:00"), SEL, SEL) === false,
  );
  ok(
    "ช่วง 07-04..07-05: 07-04 → อยู่ในช่วง",
    D.messageInTargetRange(at("2026-07-04", "10:00"), "2026-07-04", SEL) === true,
  );
}

console.log("\n===== 3) candidate/ขอบล่าง: labelOnOrAfter =====");
{
  const NOW = new Date(2026, 6, 6, 12, 0, 0); // 6 ก.ค. 2026 เที่ยง (local test clock)
  // ห้อง A: label 'Today' (07-06) → ยังเป็น candidate เพราะ >= 07-05 (มีสิทธิ์มีประวัติ 07-05)
  ok("ห้อง A (Today) → candidate", core.labelOnOrAfter("Today", SEL, NOW) === true);
  // ห้อง B: label '5 ก.ค.' → candidate
  ok(
    "ห้อง B (07-05) → candidate",
    core.labelOnOrAfter("2026-07-05", SEL, NOW) === true,
  );
  // ห้อง C: label '4 ก.ค.' → ต่ำกว่า fromDate → หยุด scroll (ไม่ใช่ candidate)
  ok(
    "ห้อง C (07-04) → ไม่ใช่ candidate (ขอบล่าง)",
    core.labelOnOrAfter("2026-07-04", SEL, NOW) === false,
  );
}

console.log("\n===== 4) เก็บทุกข้อความก่อน + แยก QC pairing (customer-only ไม่หาย) =====");
{
  // ห้องลูกค้าอย่างเดียว: ข้อความลูกค้า 2 ข้อความ 07-05 ไม่มีแอดมินตอบ
  const custOnly = [
    { direction: "customer", message_text: "สอบถามหน่อยครับ", created_at: at(SEL, "10:00") },
    { direction: "customer", message_text: "ยังอยู่ไหมครับ", created_at: at(SEL, "10:05") },
  ];
  const pairsCO = core.pairMessages(custOnly, { groupWindowSec: 180 });
  const realPairsCO = pairsCO.filter((p) => p.customer_text && p.admin_text);
  ok("customer-only → ไม่มีคู่ QC (admin_text ว่าง)", realPairsCO.length === 0);
  // pending: ลูกค้าที่อยู่หลัง admin คนสุดท้าย (ไม่มี admin เลย → ทั้งหมด pending)
  let lastAdmin = -1;
  custOnly.forEach((m, i) => { if (m.direction === "admin") lastAdmin = i; });
  const pending = custOnly.filter((m, i) => m.direction === "customer" && i > lastAdmin);
  ok("customer-only → pending_reply = 2", pending.length === 2);

  // ห้องแอดมินตอบ: ลูกค้าถาม + แอดมิน (PK) ตอบ → เกิดคู่ QC
  const replied = [
    { direction: "customer", message_text: "ฝากเงินยังไงครับ", created_at: at(SEL, "11:00") },
    { direction: "admin", message_text: "ทำรายการผ่านเมนูฝากได้เลยครับ", created_at: at(SEL, "11:01"), admin_name: "PK - Jane" },
  ];
  const pairsR = core.pairMessages(replied, { groupWindowSec: 180 });
  const realPairsR = pairsR.filter((p) => p.customer_text && p.admin_text);
  ok("admin-replied → เกิดคู่ QC 1 คู่", realPairsR.length === 1);
  ok(
    "คู่ QC มี customer_text + admin_text ครบ",
    realPairsR[0]?.customer_text?.includes("ฝากเงิน") &&
      realPairsR[0]?.admin_text?.includes("เมนูฝาก"),
  );
}

console.log("\n===== 5) toDate ถูกใช้จริง (ช่วงหลายวัน) =====");
{
  const from = "2026-07-03";
  const to = "2026-07-05";
  ok("07-03 อยู่ในช่วง", D.messageInTargetRange(at("2026-07-03", "09:00"), from, to) === true);
  ok("07-05 อยู่ในช่วง", D.messageInTargetRange(at("2026-07-05", "09:00"), from, to) === true);
  ok("07-06 (วันนี้) นอกช่วง", D.messageInTargetRange(at("2026-07-06", "09:00"), from, to) === false);
  ok("07-02 ก่อนช่วง", D.messageInTargetRange(at("2026-07-02", "09:00"), from, to) === false);
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ผ่าน ${pass} / ล้มเหลว ${fail}`);
process.exit(fail === 0 ? 0 : 1);

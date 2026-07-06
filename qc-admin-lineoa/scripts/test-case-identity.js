// test-case-identity.js — ยืนยัน "ชื่อลูกค้าต้องไม่ใช่ข้อความแชท" + case identity
//   npm run test:case-identity
const CI = require("../lib/customer-identity");

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
};

const SERVICE_MSG =
  "ขณะนี้ระบบฝาก-ถอน N8TH ปิดให้บริการชั่วคราว ระหว่างนี้ลูกค้ายังคงสามารถใช้บริการได้ตามปกติ ขอบคุณค่ะ";

console.log("===== 1) ข้อความแชท/ระบบ ต้องไม่เป็นชื่อลูกค้า =====");
ok("ข้อความบริการยาว → ไม่ valid", CI.isValidCustomerDisplayName(SERVICE_MSG) === false);
ok("ข้อความบริการยาว → isLikelyMessageText", CI.isLikelyMessageText(SERVICE_MSG) === true);
ok("ประโยคลงท้าย ค่ะ → ไม่ valid", CI.isValidCustomerDisplayName("ฝากเงินยังไงคะ") === false);
ok("มี ? → ไม่ valid", CI.isValidCustomerDisplayName("ทำยังไงดี?") === false);
ok("มีขึ้นบรรทัดใหม่ → ไม่ valid", CI.isValidCustomerDisplayName("สมชาย\nใจดี ครับ") === false);
ok("ยาวเกิน 80 → ไม่ valid", CI.isValidCustomerDisplayName("ก".repeat(90)) === false);

console.log("\n===== 2) ชื่อจริงสั้น ๆ ใช้ได้ =====");
ok("'Nice' → valid", CI.isValidCustomerDisplayName("Nice") === true);
ok("'คุณสมชาย ใจดี' → valid", CI.isValidCustomerDisplayName("คุณสมชาย ใจดี") === true);
ok("'KimberRR' → valid", CI.isValidCustomerDisplayName("KimberRR") === true);
ok("'838160/0958672075' → valid (รหัสลูกค้า)", CI.isValidCustomerDisplayName("838160/0958672075") === true);

console.log("\n===== 3) resolveCustomerIdentity ตามลำดับ =====");
ok(
  "chatList ชื่อจริง → ใช้เลย",
  CI.resolveCustomerIdentity({ chatListName: "Nice", chatHeaderName: "x" }) === "Nice",
);
ok(
  "chatList เป็นข้อความ → ข้ามไปใช้ header",
  CI.resolveCustomerIdentity({ chatListName: SERVICE_MSG, chatHeaderName: "สมหญิง" }) === "สมหญิง",
);
ok(
  "ทุกแหล่งเป็นข้อความ/ว่าง → ไม่ทราบชื่อลูกค้า",
  CI.resolveCustomerIdentity({ chatListName: SERVICE_MSG, chatHeaderName: "", lineProfileName: null }) === CI.UNKNOWN,
);
ok(
  "customer_text ห้ามถูกใช้เป็นชื่อ (ไม่ส่งเข้า resolve เลย + ถูก reject)",
  CI.resolveCustomerIdentity({ chatListName: "อยากถอนเงินครับ" }) === CI.UNKNOWN,
);

console.log("\n===== 4) sanitizeCustomerName =====");
ok("ชื่อจริง → คืนชื่อ", CI.sanitizeCustomerName("Nice") === "Nice");
ok("ข้อความ → คืน null", CI.sanitizeCustomerName(SERVICE_MSG) === null);
ok("ช่องว่างเกิน → normalize", CI.sanitizeCustomerName("  Nice   Boy ") === "Nice Boy");

console.log("\n===== 5) case_ref: stable + distinct ต่อ qc_score =====");
const ref = (id) => CI.deriveCaseRef({ sourceId: id });
const a = "3f2504e0-4f89-41d3-9a0c-000000000001";
const b = "3f2504e0-4f89-41d3-9a0c-000000000002";
ok("qc เดียวกัน → ref เดิม (stable)", ref(a) === ref(a));
ok("ลูกค้าเดียวกัน 3 เคส → ref ต่างกัน", new Set([ref(a), ref(b), ref("aa112233-0000-0000-0000-000000000000")]).size === 3);
ok("รูปแบบ QC-YYYYMMDD-XXXXXX เมื่อมีวันที่", /^QC-\d{8}-[0-9A-Z]{6}$/.test(CI.deriveCaseRef({ sourceId: a, createdAt: "2026-07-05T10:00:00Z" })));

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ผ่าน ${pass} / ล้มเหลว ${fail}`);
process.exit(fail === 0 ? 0 : 1);

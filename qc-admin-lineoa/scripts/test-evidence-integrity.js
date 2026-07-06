// test-evidence-integrity.js — หลักฐานผิดเคส/ป้าย 100% ปลอม ต้องเป็นไปไม่ได้
//   ครอบ 7 สถานการณ์ตาม spec (Phase 13) ด้วย lib/evidence-integrity (logic เดียวกับ API/viewer/scraper)
const EI = require("../lib/evidence-integrity");

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); };

const QC_A = "aaaaaaaa-0000-0000-0000-000000000001";
const QC_B = "bbbbbbbb-0000-0000-0000-000000000002";
const CONV = "cccccccc-0000-0000-0000-000000000003";
const caseA = {
  qc_score_id: QC_A, case_ref: "QC-20260706-698D5E", conversation_id: CONV,
  customer_message_ids: ["m1"], admin_message_ids: ["m2"],
};

console.log("===== 1) conversation เดียวกัน เคส A เปิดอยู่ — หลักฐานเคส B ต้องไม่เป็น exact =====");
{
  const evB = { qc_score_id: QC_B, case_ref: "QC-20260706-E15B3E", conversation_id: CONV, customer_message_ids: ["m9"], admin_message_ids: ["m8"] };
  const chk = EI.buildIdentityCheck(caseA, evB);
  ok("qc_score_match = false", chk.qc_score_match === false);
  ok("case_ref_match = false", chk.case_ref_match === false);
  ok("all_match = false → ห้ามขึ้นแท็บ exact", chk.all_match === false);
}

console.log("\n===== 2) ไม่มี qc_score_id (เคสที่เปิดไม่รู้ qc) → ทุกหลักฐาน all_match=false =====");
{
  const chk = EI.buildIdentityCheck({ qc_score_id: null, conversation_id: CONV }, { qc_score_id: QC_B, conversation_id: CONV });
  ok("qc ว่าง → qc_score_match=false", chk.qc_score_match === false);
  ok("all_match=false (บั๊กเดิม: !qcId เคยปล่อย exact ทั้ง conversation)", chk.all_match === false);
}

console.log("\n===== 3) case_ref ไม่ตรง → reject =====");
{
  const ev = { ...caseA, case_ref: "QC-20260706-DIFFER" };
  const chk = EI.buildIdentityCheck(caseA, ev);
  ok("case_ref mismatch → all_match=false", chk.all_match === false);
}

console.log("\n===== 4) manifest text hash ไม่ตรง → verify FAIL =====");
{
  const expectedPair = { qc_score_id: QC_A, case_ref: caseA.case_ref, customer_message_ids: ["m1"], admin_message_ids: ["m2"], customer_texts: ["ถอนเงินไม่ได้"], admin_texts: ["แก้ให้แล้วครับ"] };
  const manifest = {
    qc_score_id: QC_A, case_ref: caseA.case_ref,
    expected_customer_message_ids: ["m1"], expected_admin_message_ids: ["m2"],
    captured_customer_texts: ["ข้อความอื่นที่ไม่เกี่ยว"], captured_admin_texts: ["แก้ให้แล้วครับ"],
    captured_at: new Date().toISOString(),
  };
  const v = EI.verifyCapturedEvidence({ expectedPair, captureManifest: manifest });
  ok("verified=false", v.verified === false);
  ok("failures มี customer_text_hash_mismatch", v.failures.includes("customer_text_hash_mismatch"));
}

console.log("\n===== 5) locator 100% แต่ข้อความที่ถ่ายได้ผิด → ต้อง reject (ห้ามใช้ locator เป็น evidence conf) =====");
{
  const expectedPair = { qc_score_id: QC_A, case_ref: caseA.case_ref, customer_message_ids: ["m1"], admin_message_ids: ["m2"], customer_texts: ["สวัสดี"], admin_texts: ["ครับผม"] };
  const manifest = {
    qc_score_id: QC_A, case_ref: caseA.case_ref,
    expected_customer_message_ids: ["m1"], expected_admin_message_ids: ["m2"],
    captured_customer_texts: ["คนละข้อความ"], captured_admin_texts: ["คนละคำตอบ"],
    captured_at: new Date().toISOString(),
    locator_confidence: 100, // สูงสุด — ต้องไม่มีผลต่อ verification
  };
  const v = EI.verifyCapturedEvidence({ expectedPair, captureManifest: manifest });
  ok("locator=100 แต่ verified=false", v.verified === false);
  ok("text_score = 0", v.text_score === 0, `text=${v.text_score}`);
}

console.log("\n===== 6) url เดียวใช้ข้ามหลาย qc → ต้องถูก flag =====");
{
  // logic เดียวกับ audit route (group url → distinct qc > 1)
  const rows = [
    { url: "u1", qc: QC_A }, { url: "u1", qc: QC_B }, { url: "u2", qc: QC_A }, { url: "u2", qc: QC_A },
  ];
  const g = {};
  rows.forEach((r) => { (g[r.url] = g[r.url] || new Set()).add(r.qc); });
  const flagged = Object.entries(g).filter(([, s]) => s.size > 1).map(([u]) => u);
  ok("u1 (2 เคส) ถูก flag", flagged.includes("u1"));
  ok("u2 (เคสเดียว) ไม่ถูก flag", !flagged.includes("u2"));
}

console.log("\n===== 7) หลักฐานที่ถูกต้องครบ → ผ่าน =====");
{
  const expectedPair = { qc_score_id: QC_A, case_ref: caseA.case_ref, customer_message_ids: ["m1"], admin_message_ids: ["m2"], customer_texts: ["ถอนเงินไม่ได้ครับ"], admin_texts: ["แก้ให้แล้วครับ ลองใหม่"] };
  const manifest = {
    qc_score_id: QC_A, case_ref: caseA.case_ref,
    expected_customer_message_ids: ["m1"], expected_admin_message_ids: ["m2"],
    captured_customer_texts: ["ถอนเงินไม่ได้ครับ"], captured_admin_texts: ["แก้ให้แล้วครับ  ลองใหม่"],
    captured_at: new Date().toISOString(),
  };
  const v = EI.verifyCapturedEvidence({ expectedPair, captureManifest: manifest });
  ok("verified=true", v.verified === true, v.failures.join(","));
  ok("identity=100 text=100", v.identity_score === 100 && v.text_score === 100);
  const chk = EI.buildIdentityCheck(caseA, { ...caseA });
  ok("identity_check.all_match=true", chk.all_match === true);
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ผ่าน ${pass} / ล้มเหลว ${fail}`);
process.exit(fail === 0 ? 0 : 1);

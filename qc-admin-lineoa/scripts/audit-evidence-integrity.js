// ============================================================
// audit-evidence-integrity.js — ตรวจตัวตนหลักฐานทั้งหมดบน production (read-only)
//   ตรวจ A-J: qc/case_ref/conversation/message-ids mismatch, manifest missing,
//   captured text hash mismatch, reused url, exact-without-verified
//   โหมด: มี DATABASE_URL → ต่อ DB ตรง; ไม่มี → เรียก /api/admin/audit-evidence-integrity (x-api-key)
//   ใช้: npm run audit:evidence-integrity   (ไม่แก้ข้อมูลใด ๆ)
// ============================================================
require("dotenv").config();

const URL_ = (process.env.QC_API_URL || "https://qc-admin-1.vercel.app").replace(/\/$/, "");
const KEY = process.env.QC_API_KEY || process.env.ADMIN_API_KEY || "";

async function viaApi() {
  const r = await fetch(URL_ + "/api/admin/audit-evidence-integrity", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({ apply: false }),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function printReport(j) {
  const b = j.breakdown || {};
  console.log("===== EVIDENCE INTEGRITY AUDIT (production) =====");
  console.log(`  total evidence        : ${b.total_all ?? j.counts?.total}`);
  console.log(`  exact evidence        : ${b.exact ?? "-"}`);
  console.log(`  verified evidence     : ${b.verified ?? "-"}`);
  console.log(`  unverified (exact)    : ${b.exact_not_verified ?? j.counts?.exact_unverified}`);
  console.log(`  rejected (quarantine) : ${b.rejected ?? "-"}`);
  console.log(`  legacy references     : ${b.legacy ?? j.counts?.legacy_unverified}`);
  console.log("\n===== DETECTIONS (A-J) =====");
  const c = j.counts || {};
  const rows = [
    ["A qc_score_id mismatch/missing", c.qc_missing],
    ["B case_ref mismatch", c.case_ref_mismatch],
    ["C conversation mismatch", c.conversation_mismatch],
    ["D/E pair message ids mismatch", c.pair_ids_mismatch],
    ["   pair text mismatch", c.pair_text_mismatch],
    ["F manifest missing (exact pair_focus)", c.manifest_missing],
    ["G captured customer hash mismatch", c.captured_customer_hash_mismatch],
    ["H captured admin hash mismatch", c.captured_admin_hash_mismatch],
    ["I reused url across qc cases", c.reused_url],
    ["J exact without verified", c.exact_unverified],
  ];
  rows.forEach(([k, v]) => console.log(`  ${v > 0 ? "❌" : "✅"} ${k}: ${v ?? 0}`));
  console.log(`\n  mismatched rows (ต้อง quarantine): ${c.mismatched}`);
  (j.mismatched_samples || []).forEach((x) =>
    console.log(`    • ${String(x.id).slice(0, 8)} ${x.type} e_ref=${x.e_ref} q_ref=${x.q_ref} [${x.reasons}]`),
  );
  (j.reused_urls || []).forEach((u) => console.log(`    • reused (${u.n} เคส): ${u.url}`));
  const clean = (c.mismatched || 0) === 0 && (c.manifest_missing || 0) === 0 && (c.captured_customer_hash_mismatch || 0) === 0 && (c.captured_admin_hash_mismatch || 0) === 0;
  console.log(`\n${clean ? "✅ AUDIT CLEAN — ไม่มีหลักฐานตัวตนผิดที่ยังไม่ถูกกักกัน" : "❌ พบปัญหา — รัน scripts/quarantine-invalid-evidence.js --apply"}`);
  return clean;
}

(async () => {
  if (!KEY && !process.env.DATABASE_URL) {
    console.error("ต้องมี QC_API_KEY (เรียกผ่าน API) หรือ DATABASE_URL (ต่อ DB ตรง)");
    process.exit(2);
  }
  try {
    const j = await viaApi(); // route ฝั่ง server มี DATABASE_URL เสมอ
    const clean = printReport(j);
    process.exit(clean ? 0 : 1);
  } catch (e) {
    console.error("audit ล้มเหลว:", e.message);
    process.exit(1);
  }
})();

// ============================================================
// quarantine-invalid-evidence.js — กักกันหลักฐานตัวตนผิด (ไม่ลบไฟล์/แถว)
//   ค่าเริ่มต้น = DRY-RUN (รายงานอย่างเดียว) · แก้จริงต้องใส่ --apply
//   สำหรับแถว mismatch: verification_status='rejected', match_status='rejected',
//   evidence_scope='invalid_reference' — เก็บประวัติทุกแถวใน data_repair_logs
//   ใช้: node scripts/quarantine-invalid-evidence.js [--apply]
// ============================================================
require("dotenv").config();

const URL_ = (process.env.QC_API_URL || "https://qc-admin-1.vercel.app").replace(/\/$/, "");
const KEY = process.env.QC_API_KEY || process.env.ADMIN_API_KEY || "";
const APPLY = process.argv.includes("--apply");

(async () => {
  if (!KEY) { console.error("ต้องมี QC_API_KEY"); process.exit(2); }
  const call = (apply) =>
    fetch(URL_ + "/api/admin/audit-evidence-integrity", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": KEY },
      body: JSON.stringify({ apply }),
    }).then(async (r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); });

  // dry-run เสมอก่อน — รายงานสิ่งที่จะโดนกักกัน
  const dry = await call(false);
  const n = dry.counts?.mismatched || 0;
  console.log(`===== QUARANTINE ${APPLY ? "(APPLY)" : "(DRY-RUN)"} =====`);
  console.log(`แถวที่เข้าเกณฑ์กักกัน: ${n}`);
  (dry.mismatched_samples || []).forEach((x) =>
    console.log(`  • ${String(x.id).slice(0, 8)} ${x.type} e_ref=${x.e_ref} q_ref=${x.q_ref} [${x.reasons}]`),
  );
  if (!n) { console.log("✅ ไม่มีอะไรต้องกักกัน"); process.exit(0); }
  if (!APPLY) {
    console.log("\n(dry-run — ใส่ --apply เพื่อกักกันจริง · ค่าเดิมถูกเก็บใน data_repair_logs เสมอ)");
    process.exit(0);
  }
  const res = await call(true);
  console.log(`\n✅ กักกันแล้ว ${res.counts?.quarantined} แถว (verification_status=rejected, scope=invalid_reference)`);
  const re = await call(false);
  console.log(`ตรวจซ้ำ: mismatched คงเหลือ = ${re.counts?.mismatched} ${re.counts?.mismatched === 0 ? "✅" : "❌"}`);
  process.exit(re.counts?.mismatched === 0 ? 0 : 1);
})();

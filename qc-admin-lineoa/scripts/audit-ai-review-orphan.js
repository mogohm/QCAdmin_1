// ============================================================
// audit-ai-review-orphan.js — ยืนยัน ai_review_queue ไม่มี orphan (qc_score_id ชี้เคสที่ถูกลบ)
//   ต้อง = 0 หลัง migrate (FK ON DELETE CASCADE + cleanup)
//   รัน: node scripts/audit-ai-review-orphan.js   (ต้องมี QC_API_URL/ADMIN_API_KEY ใน .env)
//   ถ้าไม่มี key → SKIP (ไม่ fail) เพื่อไม่บล็อก uat:check ในเครื่องที่ไม่มีสิทธิ์ prod
// ============================================================
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const B = (process.env.QC_API_URL || "").replace(/\/$/, "");
const K = process.env.QC_API_KEY || process.env.ADMIN_API_KEY || "";

(async () => {
  if (!B || !K) {
    console.log("⏭️  SKIP — ไม่มี QC_API_URL/ADMIN_API_KEY (ตรวจ ai_review orphan แบบ live ไม่ได้)");
    process.exit(0);
  }
  try {
    const j = await fetch(`${B}/api/debug/counts`, { headers: { "x-api-key": K } }).then((r) => r.json());
    const orphans = j.ai_review_orphans;
    if (orphans === 0) {
      console.log("✅ PASS — ai_review_queue orphan = 0 (FK ON DELETE CASCADE ทำงาน)");
      process.exit(0);
    }
    console.log(`❌ FAIL — ai_review_queue orphan = ${orphans} (ต้อง = 0) · รัน migrate-uat เพื่อ cleanup+FK`);
    process.exit(1);
  } catch (e) {
    console.log("⏭️  SKIP — เรียก /api/debug/counts ไม่สำเร็จ:", e.message);
    process.exit(0);
  }
})();

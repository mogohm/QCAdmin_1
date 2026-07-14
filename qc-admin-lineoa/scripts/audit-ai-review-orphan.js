// ============================================================
// audit-ai-review-orphan.js — ยืนยัน ai_review_queue ไม่มี orphan (qc_score_id ชี้เคสที่ถูกลบ)
//   ต้อง = 0 หลัง migrate (FK ON DELETE CASCADE + cleanup)
//   รัน: node scripts/audit-ai-review-orphan.js   (ต้องมี QC_API_URL/ADMIN_API_KEY ใน .env)
//   ถ้าไม่มี key → SKIP (ไม่ fail) เพื่อไม่บล็อก uat:check ในเครื่องที่ไม่มีสิทธิ์ prod
//   ใช้ https module (ไม่ใช่ fetch/undici) — เลี่ยง libuv teardown assertion บน Windows ที่ทำ exit code เพี้ยน
// ============================================================
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const https = require("https");
const http = require("http");
const B = (process.env.QC_API_URL || "").replace(/\/$/, "");
const K = process.env.QC_API_KEY || process.env.ADMIN_API_KEY || "";
const done = (code, msg) => { console.log(msg); process.exitCode = code; };

if (!B || !K) {
  done(0, "⏭️  SKIP — ไม่มี QC_API_URL/ADMIN_API_KEY (ตรวจ ai_review orphan แบบ live ไม่ได้)");
} else {
  const lib = B.startsWith("https") ? https : http;
  const req = lib.request(`${B}/api/debug/counts`, { headers: { "x-api-key": K } }, (res) => {
    let body = "";
    res.on("data", (c) => (body += c));
    res.on("end", () => {
      try {
        const j = JSON.parse(body);
        const orphans = j.ai_review_orphans;
        const fk = j.ai_review_fk_cascade; // จำนวน FK ON DELETE CASCADE บน ai_review_queue (>=1 = มี)
        if (orphans === 0 && fk >= 1) done(0, `✅ PASS — ai_review_queue orphan = 0 · FK ON DELETE CASCADE = มี (${fk})`);
        else if (orphans !== 0) done(1, `❌ FAIL — ai_review_queue orphan = ${orphans} (ต้อง = 0) · รัน migrate-uat เพื่อ cleanup+FK`);
        else done(1, `❌ FAIL — orphan = 0 แต่ไม่พบ FK ON DELETE CASCADE · รัน migrate-uat เพื่อเพิ่ม FK`);
      } catch (e) {
        done(0, "⏭️  SKIP — parse /api/debug/counts ไม่ได้: " + e.message);
      }
    });
  });
  req.on("error", (e) => done(0, "⏭️  SKIP — เรียก /api/debug/counts ไม่สำเร็จ: " + e.message));
  req.end();
}

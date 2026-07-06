// ============================================================
// audit-customer-identity.js — หา customer_name ที่น่าจะเป็น "ข้อความแชท" (ไม่ใช่ชื่อ)
//   อ่านอย่างเดียว (read-only) — รายงานจำนวนที่ต้องซ่อม ไม่แก้ไขข้อมูล
//   ใช้: node scripts/audit-customer-identity.js   (ต้องมี DATABASE_URL)
// ============================================================
require("dotenv").config();
const { neon } = require("@neondatabase/serverless");
const CI = require("../lib/customer-identity");

const DB = process.env.DATABASE_URL;
if (!DB) {
  console.error("⚠️ ไม่มี DATABASE_URL — รันบนเครื่อง/CI ที่ตั้งค่า DB");
  process.exit(2);
}
const sql = neon(DB);

const suspicious = (name) =>
  name != null && String(name).trim() !== "" && !CI.isValidCustomerDisplayName(name);

async function scan(label, rows, field = "customer_name") {
  const bad = rows.filter((r) => suspicious(r[field]));
  console.log(`\n[${label}] ทั้งหมด ${rows.length} · น่าสงสัย ${bad.length}`);
  bad.slice(0, 8).forEach((r) =>
    console.log(`   • id=${r.id} name="${String(r[field]).replace(/\s+/g, " ").slice(0, 60)}…"`),
  );
  return bad.length;
}

(async () => {
  console.log("===== AUDIT: customer_name ที่น่าจะเป็นข้อความแชท =====");
  let total = 0;
  try {
    total += await scan(
      "ai_review_queue",
      await sql`SELECT id, customer_name FROM ai_review_queue WHERE customer_name IS NOT NULL`,
    );
  } catch (e) { console.log("ai_review_queue:", e.message); }
  try {
    total += await scan(
      "line_customers",
      await sql`SELECT line_user_id AS id, display_name AS customer_name FROM line_customers WHERE display_name IS NOT NULL`,
    );
  } catch (e) { console.log("line_customers:", e.message); }
  try {
    total += await scan(
      "case_evidence.summary_json",
      (await sql`SELECT id, data->>'customer_name' AS customer_name FROM case_evidence WHERE evidence_type='summary_json'`),
    );
  } catch (e) { console.log("case_evidence:", e.message); }

  console.log(`\n===== รวมที่ต้องซ่อม: ${total} รายการ =====`);
  console.log(total ? "→ รัน: node scripts/repair-customer-identity.js" : "→ ไม่มีข้อมูลเสีย ✅");
  process.exit(0);
})();

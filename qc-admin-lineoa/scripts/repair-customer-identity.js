// ============================================================
// repair-customer-identity.js — ซ่อม customer_name ที่เป็นข้อความแชท (ไม่ทำลายค่าเดิม)
//   ใช้: node scripts/repair-customer-identity.js [--apply]
//     (ไม่ใส่ --apply = dry-run รายงานอย่างเดียว)
//   ลำดับ backfill: line_customers.display_name → "ไม่ทราบชื่อลูกค้า"
//   ห้ามใช้ข้อความแชทเป็นชื่อ · เก็บค่าเดิมไว้ที่ data_repair_logs ก่อนแก้
//   ต้องมี DATABASE_URL
// ============================================================
require("dotenv").config();
const { neon } = require("@neondatabase/serverless");
const CI = require("../lib/customer-identity");

const DB = process.env.DATABASE_URL;
if (!DB) { console.error("⚠️ ไม่มี DATABASE_URL"); process.exit(2); }
const sql = neon(DB);
const APPLY = process.argv.includes("--apply");

const suspicious = (name) =>
  name != null && String(name).trim() !== "" && !CI.isValidCustomerDisplayName(name);

(async () => {
  console.log(`===== REPAIR customer_name ${APPLY ? "(APPLY)" : "(DRY-RUN)"} =====`);
  // ตารางเก็บ log การซ่อม (สร้างถ้ายังไม่มี)
  await sql`CREATE TABLE IF NOT EXISTS data_repair_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT, row_id TEXT, field TEXT,
    old_value TEXT, new_value TEXT, reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now())`;

  let fixed = 0, examined = 0;
  const rows = await sql`
    SELECT r.id, r.customer_name, r.conversation_id, c.line_user_id, lc.display_name AS lc_name
    FROM ai_review_queue r
    LEFT JOIN conversations c ON c.id = r.conversation_id
    LEFT JOIN line_customers lc ON lc.line_user_id = c.line_user_id
    WHERE r.customer_name IS NOT NULL`;
  for (const r of rows) {
    if (!suspicious(r.customer_name)) continue;
    examined++;
    // backfill ตามลำดับ — ห้ามใช้ข้อความแชท
    const resolved = CI.resolveCustomerIdentity({ existingName: r.lc_name });
    const newVal = resolved === CI.UNKNOWN ? null : resolved;
    console.log(`   id=${r.id} "${String(r.customer_name).slice(0, 40)}…" → ${newVal ?? "ไม่ทราบชื่อลูกค้า(null)"}`);
    if (APPLY) {
      await sql`INSERT INTO data_repair_logs (table_name, row_id, field, old_value, new_value, reason)
        VALUES ('ai_review_queue', ${String(r.id)}, 'customer_name', ${r.customer_name}, ${newVal}, 'customer_name = message text')`;
      await sql`UPDATE ai_review_queue SET customer_name = ${newVal} WHERE id = ${r.id}::uuid`;
      fixed++;
    }
  }
  console.log(`\nพบต้องซ่อม ${examined} · ${APPLY ? `แก้แล้ว ${fixed}` : "dry-run (ใส่ --apply เพื่อแก้จริง)"}`);
  process.exit(0);
})();

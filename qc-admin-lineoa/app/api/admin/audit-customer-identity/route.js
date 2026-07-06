// ============================================================
// POST /api/admin/audit-customer-identity — ตรวจ/ซ่อมชื่อลูกค้าที่เป็น "ข้อความแชท" บน production
// ------------------------------------------------------------
//   รันฝั่ง server (มี DATABASE_URL) — เครื่อง dev ไม่มีสิทธิ์ต่อ DB ตรง
//   body: { apply?: boolean }   (ไม่ส่ง/false = audit อย่างเดียว, true = ซ่อม + เก็บ log)
//   ซ่อม: line_customers.display_name + ai_review_queue.customer_name
//     - ชื่อที่เป็นข้อความ → backfill จากแหล่งที่ valid, ไม่มี → NULL (UI แสดง "ไม่ทราบชื่อลูกค้า")
//     - ค่าเดิมถูกเก็บใน data_repair_logs ก่อนแก้เสมอ (ไม่ลบทิ้งเงียบ ๆ)
//   case_evidence.summary_json = บันทึกประวัติศาสตร์ → รายงานอย่างเดียว ไม่แก้
//   Auth: x-api-key (requireAdmin)
// ============================================================
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import {
  isValidCustomerDisplayName,
  resolveCustomerIdentity,
  UNKNOWN,
} from "@/lib/customer-identity";

const suspicious = (name) =>
  name != null &&
  String(name).trim() !== "" &&
  !isValidCustomerDisplayName(name);

export async function POST(req) {
  if (!requireAdmin(req))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const apply = b.apply === true;

  try {
    const report = { apply, repaired: { line_customers: 0, ai_review_queue: 0 } };

    // ---- 1) line_customers.display_name ----
    const customers =
      await query`SELECT line_user_id, display_name FROM line_customers WHERE display_name IS NOT NULL`;
    const badCustomers = customers.filter((c) => suspicious(c.display_name));
    const totalCustomers =
      (await query`SELECT count(*)::int n FROM line_customers`)[0]?.n ?? 0;
    report.line_customers = {
      total: totalCustomers,
      with_display_name: customers.length,
      suspicious: badCustomers.length,
      samples: badCustomers
        .slice(0, 10)
        .map((c) => ({ line_user_id: c.line_user_id, name: String(c.display_name).slice(0, 70) })),
    };

    // ---- 2) ai_review_queue.customer_name ----
    const queue = await query`
      SELECT r.id, r.customer_name, c.line_user_id, lc.display_name AS lc_name
      FROM ai_review_queue r
      LEFT JOIN conversations c ON c.id = r.conversation_id
      LEFT JOIN line_customers lc ON lc.line_user_id = c.line_user_id
      WHERE r.customer_name IS NOT NULL`;
    const badQueue = queue.filter((r) => suspicious(r.customer_name));
    report.ai_review_queue = {
      with_name: queue.length,
      suspicious: badQueue.length,
      samples: badQueue.slice(0, 10).map((r) => ({ id: r.id, name: String(r.customer_name).slice(0, 70) })),
    };

    // ---- 3) ผลกระทบต่อ conversations / qc_scores (นับผ่านลูกค้าที่ชื่อเสีย) ----
    if (badCustomers.length) {
      const ids = badCustomers.map((c) => c.line_user_id);
      report.conversations_affected =
        (await query`SELECT count(*)::int n FROM conversations WHERE line_user_id = ANY(${ids})`)[0]?.n ?? 0;
      report.qc_scores_affected =
        (await query`SELECT count(*)::int n FROM qc_scores q JOIN conversations c ON c.id=q.conversation_id WHERE c.line_user_id = ANY(${ids})`)[0]?.n ?? 0;
    } else {
      report.conversations_affected = 0;
      report.qc_scores_affected = 0;
    }

    // ---- 4) case_evidence summary_json (รายงานอย่างเดียว — บันทึกประวัติ ไม่แก้) ----
    const ev = await query`SELECT id, data->>'customer_name' AS name FROM case_evidence
      WHERE evidence_type='summary_json' AND data->>'customer_name' IS NOT NULL`.catch(() => []);
    report.case_evidence = {
      with_name: ev.length,
      suspicious: ev.filter((e) => suspicious(e.name)).length,
      note: "รายงานอย่างเดียว (หลักฐานเป็นบันทึกประวัติ ไม่แก้ย้อนหลัง)",
    };

    // ---- 5) ซ่อม (apply=true) — เก็บค่าเดิมใน data_repair_logs ก่อนเสมอ ----
    if (apply && (badCustomers.length || badQueue.length)) {
      await query`CREATE TABLE IF NOT EXISTS data_repair_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_name TEXT, row_id TEXT, field TEXT,
        old_value TEXT, new_value TEXT, reason TEXT,
        created_at TIMESTAMPTZ DEFAULT now())`;

      for (const c of badCustomers) {
        // ไม่มีแหล่งชื่ออื่นที่เชื่อได้ → NULL (UI จะแสดง "ไม่ทราบชื่อลูกค้า")
        await query`INSERT INTO data_repair_logs (table_name, row_id, field, old_value, new_value, reason)
          VALUES ('line_customers', ${c.line_user_id}, 'display_name', ${c.display_name}, ${null}, 'display_name = message/service text')`;
        await query`UPDATE line_customers SET display_name = NULL WHERE line_user_id = ${c.line_user_id}`;
        report.repaired.line_customers++;
      }
      for (const r of badQueue) {
        // backfill จากชื่อลูกค้าใน line_customers (หลังซ่อมข้อ 1 ชื่อเสียถูกล้างแล้ว)
        const resolved = resolveCustomerIdentity({ existingName: r.lc_name });
        const newVal = resolved === UNKNOWN ? null : resolved;
        await query`INSERT INTO data_repair_logs (table_name, row_id, field, old_value, new_value, reason)
          VALUES ('ai_review_queue', ${String(r.id)}, 'customer_name', ${r.customer_name}, ${newVal}, 'customer_name = message/service text')`;
        await query`UPDATE ai_review_queue SET customer_name = ${newVal} WHERE id = ${r.id}::uuid`;
        report.repaired.ai_review_queue++;
      }
    }

    return Response.json({ ok: true, ...report });
  } catch (e) {
    console.error("[audit-customer-identity]", e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

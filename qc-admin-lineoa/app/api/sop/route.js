// ============================================================
// /api/sop — SOP knowledge base (search + create/upsert)
//   Permission (server-enforced ผ่าน guard จาก lib/permissions):
//     GET  → sop.view              (sysadmin/manager เห็น; admin/leader/marketing ไม่เห็น)
//     POST → sop.create | sop.update
//   หมายเหตุ: การ enforce อยู่ที่ระดับ API ไม่ใช่แค่ซ่อนเมนูฝั่ง client
// ============================================================
import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";

// แปลงค่า keywords ที่รับมา (array หรือ comma-separated string) → array สะอาด
const arr = (v) =>
  Array.isArray(v)
    ? v
    : typeof v === "string"
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

// ------------------------------------------------------------
// GET /api/sop?q=&intent= — ค้นหา SOP (พร้อม usage stats + summary)
//   q      : ค้นจาก topic/answer (ILIKE)
//   intent : กรองตาม intent (ถ้ามี)
//   คืน: { sops, categories, total, summary }
// ------------------------------------------------------------
export async function GET(req) {
  // ต้องมีสิทธิ์ sop.view (api-key superuser / system_admin ผ่านอัตโนมัติ)
  const g = guard(req, "sop.view");
  if (g) return g;
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const intent = searchParams.get("intent");
  try {
    // ดึง SOP + used_count/last_matched_at จาก qc_scores + flag missing_required
    const rows = await query`
      SELECT s.id, s.category_code, s.topic, s.question, s.answer, s.intent, s.keywords, s.required_keywords,
             s.forbidden_keywords, s.escalation, s.is_active, s.updated_at,
             (SELECT count(*)::int FROM qc_scores q WHERE q.matched_sop_id = s.id) AS used_count,
             (SELECT max(q.created_at) FROM qc_scores q WHERE q.matched_sop_id = s.id) AS last_matched_at,
             (jsonb_array_length(COALESCE(s.required_keywords,'[]'::jsonb)) = 0) AS missing_required
      FROM sop_scripts s
      WHERE (${q}::text = '' OR s.topic ILIKE ${"%" + q + "%"} OR s.answer ILIKE ${"%" + q + "%"})
        AND (${intent}::text IS NULL OR s.intent = ${intent})
      ORDER BY s.is_active DESC, s.intent, s.topic LIMIT 1000`;
    const cats =
      await query`SELECT code, name FROM sop_categories ORDER BY code`.catch(
        () => [],
      );
    const summary = await query`SELECT count(*)::int total,
        sum(CASE WHEN is_active THEN 1 ELSE 0 END)::int active,
        sum(CASE WHEN escalation THEN 1 ELSE 0 END)::int escalation,
        sum(CASE WHEN jsonb_array_length(COALESCE(required_keywords,'[]'::jsonb))=0 THEN 1 ELSE 0 END)::int missing_required
      FROM sop_scripts`.catch(() => [{}]);
    return Response.json({
      sops: rows,
      categories: cats,
      total: rows.length,
      summary: summary[0] || {},
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ------------------------------------------------------------
// POST /api/sop — สร้าง/upsert SOP (ON CONFLICT topic → update)
//   body: { topic*, answer*, question?, intent?, category_code?,
//           keywords?, required_keywords?, forbidden_keywords?,
//           escalation?, is_active? }
//   ต้องมีสิทธิ์ sop.create หรือ sop.update
// ------------------------------------------------------------
export async function POST(req) {
  const g = guard(req, "sop.create", "sop.update");
  if (g) return g;
  const b = await req.json().catch(() => ({}));
  // topic + answer เป็น field บังคับ
  if (!b.topic || !b.answer)
    return Response.json({ error: "topic, answer required" }, { status: 400 });
  try {
    const rows = await query`
      INSERT INTO sop_scripts (category_code, topic, question, answer, intent, keywords, required_keywords, forbidden_keywords, escalation, is_active)
      VALUES (${b.category_code || b.intent || null}, ${b.topic}, ${b.question || b.topic}, ${b.answer}, ${b.intent || null},
              ${JSON.stringify(arr(b.keywords))}, ${JSON.stringify(arr(b.required_keywords))}, ${JSON.stringify(arr(b.forbidden_keywords))},
              ${!!b.escalation}, ${b.is_active !== false})
      ON CONFLICT (topic) DO UPDATE SET answer=EXCLUDED.answer, intent=EXCLUDED.intent, updated_at=now()
      RETURNING *`;
    return Response.json({ ok: true, sop: rows[0] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

// ============================================================
// /api/knowledge-training — สอน AI ความรู้ใหม่ (Poker/App/Game/...) เก็บใน sop_scripts
// ------------------------------------------------------------
//   GET ?type=&q=
//     type : กรองตาม knowledge_type/category_code/intent (เช่น Poker, Deposit)
//     q    : ค้นจาก topic/answer
//     Response: { items: [...], knowledge_types: [...] }
//     Permission: sop.view หรือ sop.create หรือ sop.update
//
//   POST { topic*, answer*, knowledge_type?, intent?, category_code?,
//          keywords?, required_keywords?, forbidden_keywords?, example_questions? }
//     upsert ตาม topic (ON CONFLICT) — ระบบใช้ความรู้นี้จับคู่ SOP + ประเมิน QC
//     Permission: sop.create หรือ sop.update
//   หมายเหตุ: enforce สิทธิ์ที่ระดับ API (server-side) ทุก method
// ============================================================
import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";

// รับ keywords (array หรือ comma-separated) → array สะอาด

const arr = (v) =>
  Array.isArray(v)
    ? v
    : typeof v === "string"
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

export async function GET(req) {
  const gate = guard(req, "sop.view", "sop.create", "sop.update");
  if (gate) return gate;
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type");
  const q = (sp.get("q") || "").trim();
  try {
    const rows = await query`
      SELECT id, topic, question, answer, intent, category_code, knowledge_type,
             example_questions, required_keywords, forbidden_keywords, training_status,
             source_case_id, is_active, updated_at
      FROM sop_scripts
      WHERE (${type}::text IS NULL OR knowledge_type = ${type} OR category_code = ${type} OR intent = ${type})
        AND (${q}::text = '' OR topic ILIKE ${"%" + q + "%"} OR answer ILIKE ${"%" + q + "%"})
      ORDER BY updated_at DESC NULLS LAST, topic LIMIT 500`;
    const types =
      await query`SELECT DISTINCT knowledge_type FROM sop_scripts WHERE knowledge_type IS NOT NULL`.catch(
        () => [],
      );
    return Response.json({
      items: rows,
      knowledge_types: types.map((t) => t.knowledge_type),
    });
  } catch (e) {
    return Response.json({ error: e.message, items: [] }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = guard(req, "sop.create", "sop.update");
  if (gate) return gate;
  const b = await req.json().catch(() => ({}));
  if (!b.topic || !b.answer)
    return Response.json({ error: "topic, answer required" }, { status: 400 });
  try {
    const rows = await query`
      INSERT INTO sop_scripts (topic, question, answer, intent, category_code, knowledge_type,
        keywords, required_keywords, forbidden_keywords, example_questions, training_status, is_active)
      VALUES (${b.topic}, ${b.question || b.topic}, ${b.answer}, ${b.intent || null},
              ${b.category_code || b.knowledge_type || null}, ${b.knowledge_type || null},
              ${JSON.stringify(arr(b.keywords))}, ${JSON.stringify(arr(b.required_keywords))},
              ${JSON.stringify(arr(b.forbidden_keywords))}, ${JSON.stringify(arr(b.example_questions))},
              'active', ${b.is_active !== false})
      ON CONFLICT (topic) DO UPDATE SET answer=EXCLUDED.answer, intent=EXCLUDED.intent,
        knowledge_type=EXCLUDED.knowledge_type, example_questions=EXCLUDED.example_questions, updated_at=now()
      RETURNING *`;
    return Response.json({ ok: true, knowledge: rows[0] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

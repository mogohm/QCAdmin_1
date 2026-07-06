// POST /api/ai-review/:id/create-sop — สร้าง SOP จากเคสที่ AI ไม่เข้าใจ (ให้ AI เรียนรู้เพิ่ม)
//   body: { topic, answer, intent?, knowledge_type?, required_keywords?, example_questions? }
//   ต้องมีสิทธิ์ sop.create (หรือ sop.update)
import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";
import { validateEntityId } from "@/lib/db-id";

const arr = (v) =>
  Array.isArray(v)
    ? v
    : typeof v === "string"
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

export async function POST(req, { params }) {
  const gate = guard(req, "sop.create", "sop.update");
  if (gate) return gate;
  const { id } = await params;
  const v = validateEntityId(id, "uuid");
  if (!v.ok)
    return Response.json(
      {
        error:
          "ไม่สามารถดำเนินการได้ เนื่องจากข้อมูลเคสไม่ถูกต้อง กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ",
      },
      { status: 400 },
    );
  const b = await req.json().catch(() => ({}));
  if (!b.topic || !b.answer)
    return Response.json(
      { error: "กรุณากรอกหัวข้อ SOP และคำตอบให้ครบ" },
      { status: 400 },
    );
  try {
    const q = await query`SELECT * FROM ai_review_queue WHERE id = ${v.value}::uuid`;
    if (!q[0])
      return Response.json({ error: "ไม่พบเคสนี้ในระบบ" }, { status: 404 });
    const rows = await query`
      INSERT INTO sop_scripts (topic, question, answer, intent, category_code, knowledge_type,
        required_keywords, example_questions, source_case_id, training_status, is_active)
      VALUES (${b.topic}, ${b.question || q[0].customer_text || b.topic}, ${b.answer},
              ${b.intent || q[0].detected_intent || null}, ${b.category_code || b.intent || null},
              ${b.knowledge_type || null}, ${JSON.stringify(arr(b.required_keywords))},
              ${JSON.stringify(arr(b.example_questions).length ? arr(b.example_questions) : [q[0].customer_text].filter(Boolean))},
              ${q[0].qc_score_id || null}, 'active', true)
      ON CONFLICT (topic) DO UPDATE SET answer = EXCLUDED.answer, intent = EXCLUDED.intent, updated_at = now()
      RETURNING *`;
    // mark review case = corrected + link sop
    await query`UPDATE ai_review_queue SET status='corrected', review_action='create_sop',
                  corrected_sop_id=${rows[0].id}, reviewed_at=now() WHERE id = ${v.value}::uuid`.catch(
      () => {},
    );
    return Response.json({ ok: true, sop: rows[0] });
  } catch (e) {
    console.error("[ai-review create-sop]", e.message);
    return Response.json(
      {
        error:
          "ไม่สามารถสร้าง SOP จากเคสนี้ได้ กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาโปรดติดต่อผู้ดูแลระบบ",
      },
      { status: 500 },
    );
  }
}

// PATCH /api/knowledge-training/:id — แก้ความรู้ (sop_scripts)
import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";

const arr = (v) =>
  v === undefined
    ? undefined
    : Array.isArray(v)
      ? v
      : typeof v === "string"
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

export async function PATCH(req, { params }) {
  const gate = guard(req, "sop.update");
  if (gate) return gate;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const eq = arr(b.example_questions);
  const rq = arr(b.required_keywords);
  const fb = arr(b.forbidden_keywords);
  try {
    const rows = await query`
      UPDATE sop_scripts SET
        topic = COALESCE(${b.topic ?? null}, topic),
        answer = COALESCE(${b.answer ?? null}, answer),
        intent = COALESCE(${b.intent ?? null}, intent),
        knowledge_type = COALESCE(${b.knowledge_type ?? null}, knowledge_type),
        example_questions = COALESCE(${eq !== undefined ? JSON.stringify(eq) : null}::jsonb, example_questions),
        required_keywords = COALESCE(${rq !== undefined ? JSON.stringify(rq) : null}::jsonb, required_keywords),
        forbidden_keywords = COALESCE(${fb !== undefined ? JSON.stringify(fb) : null}::jsonb, forbidden_keywords),
        training_status = COALESCE(${b.training_status ?? null}, training_status),
        is_active = COALESCE(${b.is_active ?? null}, is_active),
        updated_at = now()
      WHERE id = ${id} RETURNING *`;
    if (!rows[0]) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ ok: true, knowledge: rows[0] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

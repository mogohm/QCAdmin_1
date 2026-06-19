import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";

// แปลง value → array (รับ array หรือ comma string)
function toArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string")
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return null;
}

// PATCH /api/sop/:id — แก้ไข SOP (เฉพาะ field ที่ส่งมา)
export async function PATCH(req, { params }) {
  const g = guard(req, "sop.update");
  if (g) return g;

  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  const kw = b.keywords !== undefined ? JSON.stringify(toArray(b.keywords) || []) : null;
  const rq = b.required_keywords !== undefined ? JSON.stringify(toArray(b.required_keywords) || []) : null;
  const fb = b.forbidden_keywords !== undefined ? JSON.stringify(toArray(b.forbidden_keywords) || []) : null;

  try {
    const rows = await query`
      UPDATE sop_scripts SET
        category_code      = COALESCE(${b.category_code ?? null}, category_code),
        topic              = COALESCE(${b.topic ?? null}, topic),
        question           = COALESCE(${b.question ?? null}, question),
        answer             = COALESCE(${b.answer ?? null}, answer),
        intent             = COALESCE(${b.intent ?? null}, intent),
        keywords           = COALESCE(${kw}::jsonb, keywords),
        required_keywords  = COALESCE(${rq}::jsonb, required_keywords),
        forbidden_keywords = COALESCE(${fb}::jsonb, forbidden_keywords),
        escalation         = COALESCE(${b.escalation ?? null}, escalation),
        is_active          = COALESCE(${b.is_active ?? null}, is_active),
        updated_at         = now()
      WHERE id = ${id}
      RETURNING *`;
    if (!rows[0]) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ ok: true, sop: rows[0] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/sop/:id — soft delete (set is_active=false) ; ?hard=true เพื่อลบจริง
export async function DELETE(req, { params }) {
  const g = guard(req, "sop.delete");
  if (g) return g;

  const { id } = await params;
  const hard = new URL(req.url).searchParams.get("hard") === "true";

  try {
    if (hard) {
      const rows = await query`DELETE FROM sop_scripts WHERE id = ${id} RETURNING id, topic`;
      if (!rows[0]) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json({ ok: true, hard_deleted: rows[0] });
    }
    const rows = await query`
      UPDATE sop_scripts SET is_active = false, updated_at = now()
      WHERE id = ${id}
      RETURNING id, topic, is_active`;
    if (!rows[0]) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ ok: true, soft_deleted: rows[0] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

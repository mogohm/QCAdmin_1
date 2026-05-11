import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function PATCH(req, { params }) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const rows = await query`
    UPDATE knowledge_rules
    SET rule_name        = COALESCE(${body.rule_name ?? null}, rule_name),
        category         = COALESCE(${body.category ?? null}, category),
        question_keywords= COALESCE(${body.question_keywords != null ? JSON.stringify(body.question_keywords) : null}::jsonb, question_keywords),
        answer_keywords  = COALESCE(${body.answer_keywords != null ? JSON.stringify(body.answer_keywords) : null}::jsonb, answer_keywords),
        weight           = COALESCE(${body.weight ?? null}, weight),
        is_active        = COALESCE(${body.is_active ?? null}, is_active)
    WHERE id = ${id}
    RETURNING *
  `;
  return Response.json(rows[0] || { error: 'not found' });
}

export async function DELETE(req, { params }) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  await query`DELETE FROM knowledge_rules WHERE id = ${id}`;
  return Response.json({ ok: true });
}

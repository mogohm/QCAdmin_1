import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { readSession } from '@/lib/session';

const arr = (v) => Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : null);
function allow(req) { return requireAdmin(req) || readSession(req)?.role === 'manager'; }

// PATCH — แก้ไข SOP
export async function PATCH(req, { params }) {
  if (!allow(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  try {
    const kw = b.keywords !== undefined ? JSON.stringify(arr(b.keywords) || []) : null;
    const rq = b.required_keywords !== undefined ? JSON.stringify(arr(b.required_keywords) || []) : null;
    const fb = b.forbidden_keywords !== undefined ? JSON.stringify(arr(b.forbidden_keywords) || []) : null;
    const rows = await query`
      UPDATE sop_scripts SET
        category_code = COALESCE(${b.category_code ?? null}, category_code),
        topic         = COALESCE(${b.topic ?? null}, topic),
        question      = COALESCE(${b.question ?? null}, question),
        answer        = COALESCE(${b.answer ?? null}, answer),
        intent        = COALESCE(${b.intent ?? null}, intent),
        keywords           = COALESCE(${kw}::jsonb, keywords),
        required_keywords  = COALESCE(${rq}::jsonb, required_keywords),
        forbidden_keywords = COALESCE(${fb}::jsonb, forbidden_keywords),
        escalation    = COALESCE(${b.escalation ?? null}, escalation),
        is_active     = COALESCE(${b.is_active ?? null}, is_active),
        updated_at    = now()
      WHERE id = ${id} RETURNING *`;
    if (!rows[0]) return Response.json({ error: 'not found' }, { status: 404 });
    return Response.json({ ok: true, sop: rows[0] });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}

// DELETE — ลบ SOP (hard delete)
export async function DELETE(req, { params }) {
  if (!allow(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const rows = await query`DELETE FROM sop_scripts WHERE id = ${id} RETURNING id, topic`;
    if (!rows[0]) return Response.json({ error: 'not found' }, { status: 404 });
    return Response.json({ ok: true, deleted: rows[0] });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}

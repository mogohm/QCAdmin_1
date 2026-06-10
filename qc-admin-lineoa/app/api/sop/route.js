import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { readSession } from '@/lib/session';

const arr = (v) => Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : []);

// GET /api/sop?q=&intent=&active= — ค้นหา SOP
export async function GET(req) {
  if (!readSession(req) && !requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const intent = searchParams.get('intent');
  try {
    const rows = await query`
      SELECT id, category_code, topic, question, answer, intent, keywords, required_keywords,
             forbidden_keywords, escalation, is_active, COALESCE(used_count,0) AS used_count, updated_at
      FROM sop_scripts
      WHERE (${q}::text = '' OR topic ILIKE ${'%' + q + '%'} OR answer ILIKE ${'%' + q + '%'})
        AND (${intent}::text IS NULL OR intent = ${intent})
      ORDER BY is_active DESC, intent, topic LIMIT 1000`;
    const cats = await query`SELECT code, name FROM sop_categories ORDER BY code`.catch(() => []);
    const summary = await query`SELECT count(*)::int total,
        sum(CASE WHEN is_active THEN 1 ELSE 0 END)::int active,
        sum(CASE WHEN escalation THEN 1 ELSE 0 END)::int escalation,
        sum(CASE WHEN jsonb_array_length(COALESCE(required_keywords,'[]'::jsonb))=0 THEN 1 ELSE 0 END)::int missing_required
      FROM sop_scripts`.catch(() => [{}]);
    return Response.json({ sops: rows, categories: cats, total: rows.length, summary: summary[0] || {} });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}

// POST — create SOP
export async function POST(req) {
  if (!requireAdmin(req) && !(readSession(req)?.role === 'manager')) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.topic || !b.answer) return Response.json({ error: 'topic, answer required' }, { status: 400 });
  try {
    const rows = await query`
      INSERT INTO sop_scripts (category_code, topic, question, answer, intent, keywords, required_keywords, forbidden_keywords, escalation, is_active)
      VALUES (${b.category_code || b.intent || null}, ${b.topic}, ${b.question || b.topic}, ${b.answer}, ${b.intent || null},
              ${JSON.stringify(arr(b.keywords))}, ${JSON.stringify(arr(b.required_keywords))}, ${JSON.stringify(arr(b.forbidden_keywords))},
              ${!!b.escalation}, ${b.is_active !== false})
      ON CONFLICT (topic) DO UPDATE SET answer=EXCLUDED.answer, intent=EXCLUDED.intent, updated_at=now()
      RETURNING *`;
    return Response.json({ ok: true, sop: rows[0] });
  } catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
}

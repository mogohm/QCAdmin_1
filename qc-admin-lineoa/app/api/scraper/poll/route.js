import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// Scraper เรียกเพื่อรับ job pending
export async function GET(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401, headers: CORS });
  const rows = await query`
    SELECT * FROM scraper_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1
  `;
  return Response.json(rows[0] || null, { headers: CORS });
}

// Scraper อัพเดตสถานะ job
export async function PATCH(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401, headers: CORS });
  const { id, status, total_chats, logged_count, current_chat, error_text } = await req.json();

  const updates = { status };
  if (total_chats != null) updates.total_chats = total_chats;
  if (logged_count != null) updates.logged_count = logged_count;
  if (current_chat != null) updates.current_chat = current_chat;
  if (error_text != null) updates.error_text = error_text;
  if (status === 'running') updates.started_at = new Date().toISOString();
  if (status === 'done' || status === 'error') updates.finished_at = new Date().toISOString();

  await query`
    UPDATE scraper_jobs SET
      status       = ${updates.status},
      total_chats  = COALESCE(${updates.total_chats ?? null}, total_chats),
      logged_count = COALESCE(${updates.logged_count ?? null}, logged_count),
      current_chat = COALESCE(${updates.current_chat ?? null}, current_chat),
      error_text   = COALESCE(${updates.error_text ?? null}, error_text),
      started_at   = COALESCE(${updates.started_at ?? null}, started_at),
      finished_at  = COALESCE(${updates.finished_at ?? null}, finished_at)
    WHERE id = ${id}
  `;
  return Response.json({ ok: true }, { headers: CORS });
}

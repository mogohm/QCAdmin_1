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

// Scraper อัพเดตสถานะ job — return { ok, cancelled } เพื่อให้ scraper รู้ว่าถูกยกเลิก
export async function PATCH(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401, headers: CORS });
  const { id, status, total_chats, logged_count, current_chat, error_text } = await req.json();

  const started_at  = status === 'running' ? new Date().toISOString() : null;
  const finished_at = (status === 'done' || status === 'error' || status === 'cancelled') ? new Date().toISOString() : null;

  // COALESCE ป้องกัน NULL overwrite status — 'cancelled' ถูก overwrite ได้เฉพาะ 'error'
  const result = await query`
    UPDATE scraper_jobs SET
      status       = CASE
                       WHEN status = 'cancelled' AND ${status ?? null} != 'error' THEN status
                       ELSE COALESCE(${status ?? null}, status)
                     END,
      total_chats  = COALESCE(${total_chats ?? null}, total_chats),
      logged_count = COALESCE(${logged_count ?? null}, logged_count),
      current_chat = COALESCE(${current_chat ?? null}, current_chat),
      error_text   = COALESCE(${error_text ?? null}, error_text),
      started_at   = COALESCE(${started_at}, started_at),
      finished_at  = COALESCE(${finished_at}, finished_at)
    WHERE id = ${id}
    RETURNING status
  `;
  const currentStatus = result[0]?.status;
  return Response.json({ ok: true, cancelled: currentStatus === 'cancelled' }, { headers: CORS });
}

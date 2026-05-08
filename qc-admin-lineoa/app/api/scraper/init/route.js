import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// เรียกครั้งเดียวเพื่อสร้างตาราง scraper_jobs
export async function POST(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  await query`
    CREATE TABLE IF NOT EXISTS scraper_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date_from DATE NOT NULL,
      date_to DATE NOT NULL,
      status TEXT DEFAULT 'pending',
      total_chats INT DEFAULT 0,
      logged_count INT DEFAULT 0,
      current_chat TEXT,
      error_text TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    )
  `;
  return Response.json({ ok: true, message: 'scraper_jobs table ready' });
}

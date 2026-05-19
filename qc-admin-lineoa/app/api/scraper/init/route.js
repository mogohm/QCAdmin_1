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
  await query`
    CREATE TABLE IF NOT EXISTS customer_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      line_user_id TEXT REFERENCES line_customers(line_user_id),
      note_text TEXT NOT NULL,
      noted_at TIMESTAMPTZ,
      noted_by TEXT,
      admin_id UUID REFERENCES qc_admins(id),
      scraped_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(line_user_id, note_text, noted_at)
    )
  `;
  return Response.json({ ok: true, message: 'scraper_jobs + customer_notes tables ready' });
}

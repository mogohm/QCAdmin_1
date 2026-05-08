import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// สร้าง job ใหม่
export async function POST(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { date_from, date_to } = await req.json();
  if (!date_from || !date_to) return Response.json({ error: 'date_from, date_to required' }, { status: 400 });

  // ยกเลิก pending/running job เก่า
  await query`UPDATE scraper_jobs SET status='cancelled' WHERE status IN ('pending','running')`;

  const rows = await query`
    INSERT INTO scraper_jobs (date_from, date_to, status)
    VALUES (${date_from}, ${date_to}, 'pending')
    RETURNING *
  `;
  return Response.json({ ok: true, job: rows[0] });
}

// ดูสถานะ job ล่าสุด
export async function GET() {
  const rows = await query`
    SELECT * FROM scraper_jobs ORDER BY created_at DESC LIMIT 10
  `;
  return Response.json(rows);
}

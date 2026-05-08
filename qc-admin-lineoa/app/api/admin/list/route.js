import { query } from '@/lib/db';

export async function GET() {
  try {
    const rows = await query`
      SELECT id, member_name FROM qc_admins
      WHERE is_active = true
      ORDER BY member_name
    `;
    return Response.json(rows);
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

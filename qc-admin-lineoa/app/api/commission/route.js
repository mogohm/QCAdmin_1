import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { readSession } from '@/lib/session';

function allow(req) { return requireAdmin(req) || readSession(req)?.role === 'manager'; }

// POST — บันทึกผลคำนวณค่าคอมลง admin_commissions (period snapshot)
export async function POST(req) {
  if (!allow(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const { period_start, period_end, rows } = b;
  if (!period_start || !period_end || !Array.isArray(rows)) return Response.json({ error: 'period_start, period_end, rows[] required' }, { status: 400 });

  // ลบ snapshot เดิมของ period นี้ก่อน (กันซ้ำ)
  await query`DELETE FROM admin_commissions WHERE period_start=${period_start}::date AND period_end=${period_end}::date`;
  let saved = 0;
  for (const r of rows) {
    if (!r.admin_id) continue;
    await query`INSERT INTO admin_commissions (admin_id, period_start, period_end, avg_score, tier, tier_name, base_salary, upsell_amount, commission)
      VALUES (${r.admin_id}, ${period_start}::date, ${period_end}::date, ${r.avg_score ?? null}, ${r.tier ?? null}, ${r.tier_name ?? r.tier_label ?? null},
              ${r.base_salary ?? 0}, ${r.upsell_amount ?? 0}, ${r.commission ?? 0})`;
    saved++;
  }
  return Response.json({ ok: true, saved, period: { period_start, period_end } });
}

// GET — ดู snapshot ที่บันทึกไว้
export async function GET(req) {
  if (!allow(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const rows = await query`SELECT ac.*, a.member_name FROM admin_commissions ac
    LEFT JOIN qc_admins a ON a.id=ac.admin_id ORDER BY ac.period_end DESC, ac.commission DESC LIMIT 500`.catch(() => []);
  return Response.json({ commissions: rows });
}

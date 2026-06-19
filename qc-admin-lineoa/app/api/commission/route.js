import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";

// POST — บันทึกผลคำนวณค่าคอมลง admin_commissions (period snapshot) — ต้องมี commission.adjust
export async function POST(req) {
  const g = guard(req, "commission.adjust");
  if (g) return g;
  const b = await req.json().catch(() => ({}));
  const { period_start, period_end, rows } = b;
  if (!period_start || !period_end || !Array.isArray(rows))
    return Response.json({ error: "period_start, period_end, rows[] required" }, { status: 400 });

  try {
    // ลบ snapshot เดิมของ period นี้ก่อน (กันซ้ำ)
    await query`DELETE FROM admin_commissions WHERE period_start=${period_start}::date AND period_end=${period_end}::date`;
    let saved = 0,
      skipped = 0;
    const toInt = (v) => (v == null || isNaN(parseInt(v)) ? null : parseInt(v));
    for (const r of rows) {
      if (!r.admin_id) {
        skipped++;
        continue;
      }
      // ข้าม admin ที่ไม่มีในระบบ (กัน FK error)
      const exists = await query`SELECT 1 FROM qc_admins WHERE id=${r.admin_id} LIMIT 1`;
      if (!exists[0]) {
        skipped++;
        continue;
      }
      await query`INSERT INTO admin_commissions (admin_id, period_start, period_end, avg_score, tier, tier_name, base_salary, upsell_amount, commission)
        VALUES (${r.admin_id}, ${period_start}::date, ${period_end}::date, ${toInt(r.avg_score)}, ${toInt(r.tier)}, ${r.tier_name ?? null},
                ${r.base_salary ?? 0}, ${r.upsell_amount ?? 0}, ${r.commission ?? 0})`;
      saved++;
    }
    return Response.json({ ok: true, saved, skipped, period: { period_start, period_end } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// GET — ดู snapshot ที่บันทึกไว้
export async function GET(req) {
  const g = guard(req, "commission.view.own", "commission.view.team", "commission.view.all");
  if (g) return g;
  const rows = await query`SELECT ac.*, a.member_name FROM admin_commissions ac
    LEFT JOIN qc_admins a ON a.id=ac.admin_id ORDER BY ac.period_end DESC, ac.commission DESC LIMIT 500`.catch(
    () => [],
  );
  return Response.json({ commissions: rows });
}
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

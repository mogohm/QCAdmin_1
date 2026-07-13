import { query, transaction } from "@/lib/db";
import { guard, getCurrentUser } from "@/lib/permissions";

// POST — บันทึกผลคำนวณค่าคอมลง admin_commissions (period snapshot) — ต้องมี commission.adjust
//   TRANSACTION SAFETY: DELETE snapshot เดิม + INSERT ทุกแถว รันเป็น transaction เดียว
//   (เดิมเป็น N+1 query แยกกัน — พังกลางทาง = snapshot เดิมหายแต่ของใหม่ลงไม่ครบ,
//    สอง admin กดบันทึกพร้อมกัน = แถวซ้ำ/ทับกันแบบเดาไม่ได้)
export async function POST(req) {
  const g = guard(req, "commission.adjust");
  if (g) return g;
  const me = getCurrentUser(req); // ผู้ปรับจริงจาก session (กันปลอมชื่อจาก client)
  const b = await req.json().catch(() => ({}));
  const { period_start, period_end, rows } = b;
  if (!period_start || !period_end || !Array.isArray(rows))
    return Response.json(
      { error: "period_start, period_end, rows[] required" },
      { status: 400 },
    );

  try {
    const toInt = (v) => (v == null || isNaN(parseInt(v)) ? null : parseInt(v));
    // ตรวจ admin ที่มีจริง "ก่อน" เข้า transaction (ครั้งเดียว ไม่ใช่ N SELECT)
    const ids = [...new Set(rows.map((r) => r.admin_id).filter(Boolean))];
    const found = ids.length
      ? await query`SELECT id FROM qc_admins WHERE id = ANY(${ids}::uuid[])`
      : [];
    const known = new Set(found.map((x) => x.id));
    const valid = rows.filter((r) => r.admin_id && known.has(r.admin_id));
    const skipped = rows.length - valid.length;
    const adjustedAt = new Date().toISOString();

    // DELETE + INSERT ทั้ง period เป็น atomic batch — ล้มข้อเดียว = rollback ทั้งหมด (snapshot เดิมไม่หาย)
    await transaction((tx) => [
      tx`DELETE FROM admin_commissions WHERE period_start=${period_start}::date AND period_end=${period_end}::date`,
      ...valid.map((r) => {
        // audit trail: เก็บค่าประมาณการ (ก่อน override) + ค่า override + ใครปรับ/เมื่อไหร่
        const hasOverride = r.manual_override != null && r.manual_override !== "";
        return tx`INSERT INTO admin_commissions (admin_id, period_start, period_end, avg_score, tier, tier_name, base_salary, upsell_amount, commission,
            estimated_commission, manual_override, adjusted_by, adjusted_at)
          VALUES (${r.admin_id}, ${period_start}::date, ${period_end}::date, ${toInt(r.avg_score)}, ${toInt(r.tier)}, ${r.tier_name ?? null},
                  ${r.base_salary ?? 0}, ${r.upsell_amount ?? 0}, ${r.commission ?? 0},
                  ${r.estimated_commission ?? null}, ${hasOverride ? r.manual_override : null},
                  ${hasOverride ? me?.name || b.adjusted_by || "unknown" : null}, ${hasOverride ? adjustedAt : null})`;
      }),
    ]);
    return Response.json({
      ok: true,
      saved: valid.length,
      skipped,
      period: { period_start, period_end },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// GET — ดู snapshot ที่บันทึกไว้
export async function GET(req) {
  const g = guard(
    req,
    "commission.view.own",
    "commission.view.team",
    "commission.view.all",
  );
  if (g) return g;
  const rows = await query`SELECT ac.*, a.member_name FROM admin_commissions ac
    LEFT JOIN qc_admins a ON a.id=ac.admin_id ORDER BY ac.period_end DESC, ac.commission DESC LIMIT 500`.catch(
    () => [],
  );
  return Response.json({ commissions: rows });
}
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

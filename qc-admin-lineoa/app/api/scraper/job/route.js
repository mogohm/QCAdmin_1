import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { guard } from "@/lib/permissions";
import { validateScrapeRange } from "@/lib/scraper-date";

// สร้าง job ใหม่ — ต้องมี scraper.run (หรือ x-api-key จาก worker)
//   กฎ: date_from <= date_to, และ date_to < วันนี้ (เวลาไทย) — ห้ามเก็บวันนี้/อนาคต
export async function POST(req) {
  const g = guard(req, "scraper.run", "scraper.schedule");
  if (g) return g;
  const { date_from, date_to } = await req.json();
  if (!date_from || !date_to)
    return Response.json(
      { error: "date_from, date_to required" },
      { status: 400 },
    );

  // ตรวจช่วงวัน (Asia/Bangkok) — บล็อกวันนี้/อนาคต
  const v = validateScrapeRange(date_from, date_to);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });

  // ยกเลิก pending/running job เก่า
  await query`UPDATE scraper_jobs SET status='cancelled' WHERE status IN ('pending','running')`;

  // เก็บเป็น DATE (ไม่ใช่ timestamp)
  const rows = await query`
    INSERT INTO scraper_jobs (date_from, date_to, status)
    VALUES (${v.from}::date, ${v.to}::date, 'pending')
    RETURNING *
  `;
  return Response.json({
    ok: true,
    job: rows[0],
    normalized_range: { from: v.from, to: v.to, timezone: "Asia/Bangkok" },
  });
}

// ดูสถานะ job ล่าสุด
export async function GET() {
  const rows = await query`
    SELECT * FROM scraper_jobs ORDER BY created_at DESC LIMIT 10
  `;
  return Response.json(rows);
}

// ยกเลิก job ที่กำลังทำงาน/รออยู่
export async function DELETE(req) {
  if (!requireAdmin(req))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await query`
    UPDATE scraper_jobs
    SET status = 'cancelled', finished_at = now()
    WHERE status IN ('pending', 'running')
    RETURNING id
  `;
  return Response.json({ ok: true, cancelled: result.length });
}

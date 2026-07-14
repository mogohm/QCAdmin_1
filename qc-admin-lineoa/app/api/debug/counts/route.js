import { query } from "@/lib/db";
import { requireView, unauthorized } from "@/lib/guard";

// GET /api/debug/counts — นับ row จริงใน production DB ที่แอปนี้ใช้ (ยืนยันว่า scraper เขียนเข้า DB ตัวเดียวกับ dashboard)
export async function GET(req) {
  if (!requireView(req)) return unauthorized();
  const one = async (sql, fb = 0) => {
    try {
      const r = await sql();
      return r[0]?.n ?? r[0]?.t ?? fb;
    } catch (e) {
      return `err:${e.message}`;
    }
  };

  const out = {
    messages_total: await one(
      () => query`SELECT count(*)::int n FROM messages`,
    ),
    messages_scraper: await one(
      () =>
        query`SELECT count(*)::int n FROM messages WHERE source = 'scraper'`,
    ),
    qc_scores_total: await one(
      () => query`SELECT count(*)::int n FROM qc_scores`,
    ),
    qc_scores_scraper: await one(
      () =>
        query`SELECT count(*)::int n FROM qc_scores WHERE source = 'scraper'`,
    ),
    qc_score_details_total: await one(
      () => query`SELECT count(*)::int n FROM qc_score_details`,
    ),
    line_customers_total: await one(
      () => query`SELECT count(*)::int n FROM line_customers`,
    ),
    latest_message_at: await one(
      () => query`SELECT max(created_at) t FROM messages`,
      null,
    ),
    latest_qc_score_at: await one(
      () => query`SELECT max(created_at) t FROM qc_scores`,
      null,
    ),
    // นับตาม canonical case_at (วัน Bangkok ของเวลาเคสจริง) — นิยามเดียวกับ dashboard/analytics
    qc_by_day:
      await query`SELECT (case_at AT TIME ZONE 'Asia/Bangkok')::date::text d, count(*)::int n
        FROM qc_scores GROUP BY 1 ORDER BY 1 DESC LIMIT 7`.catch(() => []),
    // เทียบข้อความต่อวัน (Bangkok) — ใช้ตอน reconcile กับ scraper_chat_results
    messages_by_day:
      await query`SELECT ((created_at AT TIME ZONE 'Asia/Bangkok')::date)::text d, count(*)::int n
        FROM messages GROUP BY 1 ORDER BY 1 DESC LIMIT 7`.catch(() => []),
    // ai_review orphan ทั้งตาราง — ต้อง = 0 หลัง migrate (FK ON DELETE CASCADE + cleanup)
    ai_review_orphans: await one(
      () => query`SELECT count(*)::int n FROM ai_review_queue r
        WHERE r.qc_score_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM qc_scores q WHERE q.id = r.qc_score_id)`,
    ),
  };

  // host ของ DB (ปกปิด user/password) เพื่อยืนยันว่าเป็น DB ตัวเดียวกับ Vercel production
  let database_host_masked = "unset";
  try {
    const u = new URL(process.env.DATABASE_URL);
    database_host_masked = `${u.hostname}${u.pathname}`;
  } catch {}
  out.database_host_masked = database_host_masked;

  return Response.json(out);
}

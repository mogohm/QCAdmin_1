// ============================================================
// GET /api/debug/date-reconcile?date=YYYY-MM-DD  (x-api-key / requireAdmin)
//   นับทุกแหล่งของ "วันธุรกิจ Asia/Bangkok" ของ date เดียว เพื่อ reconcile
//   นิยามวัน: case_at (qc) / created_at (messages,events) ในช่วง [date 00:00+07, date+1 00:00+07)
//   คืนตัวเลขดิบ + sub-count อธิบายส่วนต่าง — script เป็นคนตัดสิน EXPECTED/EXPLAINED/BUG
// ============================================================
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET(req) {
  if (!requireAdmin(req))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return Response.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });

  // ขอบเขต Asia/Bangkok ของวันเดียว (sargable: เทียบคอลัมน์กับ constant)
  const lo = `${date} 00:00:00+07`;
  const hi = `${date} 23:59:59.999+07`;

  try {
    const r = (
      await query`
      SELECT
        (SELECT count(*)::int FROM messages WHERE created_at BETWEEN ${lo}::timestamptz AND ${hi}::timestamptz) AS messages_total,
        (SELECT count(*)::int FROM messages WHERE direction='customer' AND created_at BETWEEN ${lo}::timestamptz AND ${hi}::timestamptz) AS customer_messages,
        (SELECT count(*)::int FROM messages WHERE direction='admin' AND created_at BETWEEN ${lo}::timestamptz AND ${hi}::timestamptz) AS admin_messages,
        (SELECT count(*)::int FROM messages WHERE direction='admin' AND admin_id IS NOT NULL AND created_at BETWEEN ${lo}::timestamptz AND ${hi}::timestamptz) AS admin_messages_with_id,
        (SELECT count(*)::int FROM qc_scores WHERE case_at BETWEEN ${lo}::timestamptz AND ${hi}::timestamptz) AS qc_by_case_at,
        (SELECT count(*)::int FROM qc_scores WHERE case_at BETWEEN ${lo}::timestamptz AND ${hi}::timestamptz AND admin_id IS NULL) AS qc_no_admin,
        (SELECT count(*)::int FROM qc_scores q WHERE q.case_at BETWEEN ${lo}::timestamptz AND ${hi}::timestamptz
           AND q.admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM qc_admins a WHERE a.id=q.admin_id AND a.is_active=true)) AS qc_inactive_admin,
        (SELECT count(*)::int FROM qc_scores q JOIN qc_admins a ON a.id=q.admin_id AND a.is_active=true
           WHERE q.case_at BETWEEN ${lo}::timestamptz AND ${hi}::timestamptz) AS ranking_case_sum,
        (SELECT count(*)::int FROM ai_review_queue
           WHERE COALESCE(admin_created_at, customer_created_at, created_at) BETWEEN ${lo}::timestamptz AND ${hi}::timestamptz) AS ai_review_count,
        (SELECT count(*)::int FROM case_evidence e JOIN qc_scores q ON q.id=e.qc_score_id
           WHERE q.case_at BETWEEN ${lo}::timestamptz AND ${hi}::timestamptz
             AND e.verification_status='verified' AND e.match_status='exact') AS evidence_exact_verified,
        (SELECT count(*)::int FROM qc_scores WHERE case_at IS NULL) AS qc_case_at_null_total
    `
    )[0];

    // ai_review เป็นตารางแยก (คีย์ด้วย timestamp ของตัวเอง) — อธิบายว่าทำไม count/วันต่างจาก qc
    //   วันของ ai_review = COALESCE(admin_created_at, customer_created_at, created_at)
    //   เทียบกับ case_at ของ qc_score ที่ผูกกัน (qc_score_id): วันเดียวกัน / คนละวัน / ไม่มี qc
    const air = (
      await query`
      WITH air AS (
        SELECT r.qc_score_id
        FROM ai_review_queue r
        WHERE COALESCE(r.admin_created_at, r.customer_created_at, r.created_at) BETWEEN ${lo}::timestamptz AND ${hi}::timestamptz
      )
      SELECT
        count(*) FILTER (WHERE q.case_at BETWEEN ${lo}::timestamptz AND ${hi}::timestamptz)::int AS same_day,
        count(*) FILTER (WHERE q.case_at IS NOT NULL AND NOT (q.case_at BETWEEN ${lo}::timestamptz AND ${hi}::timestamptz))::int AS diff_day,
        count(*) FILTER (WHERE q.id IS NULL)::int AS no_qc_link,
        count(*) FILTER (WHERE air.qc_score_id IS NULL)::int AS qc_id_null,
        count(*) FILTER (WHERE air.qc_score_id IS NOT NULL AND q.id IS NULL)::int AS qc_id_dangling
      FROM air LEFT JOIN qc_scores q ON q.id = air.qc_score_id`
    )[0];

    // dashboard_total_cases = kpiExt.totalQcCases = qc นับด้วย case_at (แหล่งเดียวกับ qc_by_case_at)
    // commission_case_count = cases ที่ป้อนสูตรค่าคอม = ranking (active admin, case_at) = ranking_case_sum
    return Response.json({
      date,
      window_bangkok: { from: lo, to: hi },
      messages_total: r.messages_total,
      customer_messages: r.customer_messages,
      admin_messages: r.admin_messages,
      admin_messages_with_id: r.admin_messages_with_id,
      qc_scores_by_case_at: r.qc_by_case_at,
      dashboard_total_cases: r.qc_by_case_at,
      ranking_case_sum: r.ranking_case_sum,
      commission_case_count: r.ranking_case_sum,
      chat_review_rows: r.admin_messages_with_id,
      ai_review_queue_count: r.ai_review_count,
      evidence_exact_verified: r.evidence_exact_verified,
      // sub-counts อธิบายส่วนต่าง (ให้ script mark EXPLAINED)
      _explain: {
        qc_no_admin: r.qc_no_admin,
        qc_inactive_admin: r.qc_inactive_admin,
        admin_messages_without_id: r.admin_messages - r.admin_messages_with_id,
        non_cust_admin_messages: r.messages_total - r.customer_messages - r.admin_messages,
        qc_case_at_null_total: r.qc_case_at_null_total,
        // ai_review vs qc (คนละตาราง คนละฐานวัน): เท่ากับ qc same-day + ต่างวัน + ไม่มี qc
        ai_review_qc_same_day: air.same_day,
        ai_review_qc_diff_day: air.diff_day,
        ai_review_no_qc_link: air.no_qc_link,
        ai_review_qc_id_null: air.qc_id_null,
        ai_review_qc_id_dangling: air.qc_id_dangling,
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

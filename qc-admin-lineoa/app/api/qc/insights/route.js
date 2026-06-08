import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// แดชบอร์ด QC เชิงลึก — ตาม AI QA Rubric + Dashboard Design (Excel Sheet1)
//   GET /api/qc/insights?from=2026-06-01&to=2026-06-09
export async function GET(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const to = searchParams.get('to') || new Date().toISOString().slice(0, 10);
  const from = searchParams.get('from') || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const fromTs = `${from} 00:00:00`, toTs = `${to} 23:59:59`;

  try {
    const [
      totals, categoryScores, fatalErrors, minorErrors, sopCoverage,
      adminRanking, intentDist, coaching, skillRadar, trend,
      commissionDist, marketing, mostImproved,
    ] = await Promise.all([
      query`SELECT count(*)::int total, round(avg(final_score))::int avg_score FROM qc_scores WHERE created_at BETWEEN ${fromTs} AND ${toTs}`,
      query`SELECT COALESCE(intent,'general') AS intent, count(*)::int AS n, round(avg(final_score))::int AS avg_score,
                   sum(CASE WHEN is_fatal THEN 1 ELSE 0 END)::int AS fatal
            FROM qc_scores WHERE created_at BETWEEN ${fromTs} AND ${toTs} GROUP BY 1 ORDER BY n DESC`,
      query`SELECT count(*)::int n FROM qc_scores WHERE is_fatal = true AND created_at BETWEEN ${fromTs} AND ${toTs}`,
      query`SELECT count(*)::int n FROM qc_scores WHERE is_fatal = false AND final_score BETWEEN 50 AND 69 AND created_at BETWEEN ${fromTs} AND ${toTs}`,
      query`SELECT count(*)::int total, sum(CASE WHEN matched_sop_id IS NOT NULL THEN 1 ELSE 0 END)::int matched
            FROM qc_scores WHERE created_at BETWEEN ${fromTs} AND ${toTs}`,
      // Leaderboard: Top Performers
      query`SELECT a.member_name AS admin, count(*)::int AS replies, round(avg(q.final_score))::int AS avg_score,
                   sum(CASE WHEN q.is_fatal THEN 1 ELSE 0 END)::int AS fatal,
                   round(avg(q.response_seconds))::int AS avg_response_sec
            FROM qc_scores q JOIN qc_admins a ON a.id = q.admin_id
            WHERE q.created_at BETWEEN ${fromTs} AND ${toTs}
            GROUP BY a.member_name HAVING count(*) > 0 ORDER BY avg_score DESC, replies DESC LIMIT 50`,
      query`SELECT COALESCE(intent,'general') AS intent, count(*)::int AS n FROM qc_scores WHERE created_at BETWEEN ${fromTs} AND ${toTs} GROUP BY 1 ORDER BY n DESC`,
      query`SELECT q.id, q.final_score, q.intent, q.is_fatal, q.coaching, a.member_name AS admin, q.created_at
            FROM qc_scores q LEFT JOIN qc_admins a ON a.id = q.admin_id
            WHERE q.coaching IS NOT NULL AND q.created_at BETWEEN ${fromTs} AND ${toTs}
            ORDER BY q.created_at DESC LIMIT 30`,
      // Skill Radar (เฉลี่ยรายมิติตาม rubric)
      query`SELECT
              round(avg((dimension_scores->>'greetingClosing')::numeric))::int    AS greeting_closing,
              round(avg((dimension_scores->>'problemSolving')::numeric))::int      AS problem_solving,
              round(avg((dimension_scores->>'communicationTone')::numeric))::int   AS communication_tone,
              round(avg((dimension_scores->>'responseTime')::numeric))::int        AS response_time,
              round(avg((dimension_scores->>'creditDepositWithdraw')::numeric))::int AS credit_deposit_withdraw,
              round(avg((dimension_scores->>'kycProcess')::numeric))::int          AS kyc_process,
              round(avg((dimension_scores->>'upsellPromotion')::numeric))::int     AS upsell_promotion
            FROM qc_scores WHERE created_at BETWEEN ${fromTs} AND ${toTs} AND dimension_scores IS NOT NULL`,
      // Trend รายวัน
      query`SELECT to_char(created_at,'YYYY-MM-DD') AS d, round(avg(final_score))::int AS avg_score, count(*)::int AS n
            FROM qc_scores WHERE created_at BETWEEN ${fromTs} AND ${toTs} GROUP BY 1 ORDER BY 1`,
      // Commission tier distribution
      query`SELECT
              sum(CASE WHEN final_score >= 90 THEN 1 ELSE 0 END)::int AS tier1,
              sum(CASE WHEN final_score BETWEEN 80 AND 89 THEN 1 ELSE 0 END)::int AS tier2,
              sum(CASE WHEN final_score BETWEEN 70 AND 79 THEN 1 ELSE 0 END)::int AS tier3,
              sum(CASE WHEN final_score < 70 THEN 1 ELSE 0 END)::int AS tier4
            FROM qc_scores WHERE created_at BETWEEN ${fromTs} AND ${toTs}`,
      // Marketing: events + registrations
      query`SELECT event_type, count(*)::int AS n, COALESCE(round(sum(amount))::int,0) AS amount
            FROM customer_events WHERE created_at BETWEEN ${fromTs} AND ${toTs} GROUP BY 1`,
      // Most Improved: เทียบครึ่งหลัง vs ครึ่งแรกของช่วง
      query`WITH mid AS (SELECT (${fromTs}::timestamptz + (${toTs}::timestamptz - ${fromTs}::timestamptz)/2) AS m)
            SELECT a.member_name AS admin,
                   round(avg(CASE WHEN q.created_at < (SELECT m FROM mid) THEN q.final_score END))::int AS first_half,
                   round(avg(CASE WHEN q.created_at >= (SELECT m FROM mid) THEN q.final_score END))::int AS second_half
            FROM qc_scores q JOIN qc_admins a ON a.id=q.admin_id
            WHERE q.created_at BETWEEN ${fromTs} AND ${toTs}
            GROUP BY a.member_name
            HAVING count(*) FILTER (WHERE q.created_at < (SELECT m FROM mid)) >= 2
               AND count(*) FILTER (WHERE q.created_at >= (SELECT m FROM mid)) >= 2`,
    ]);

    const cov = sopCoverage[0] || { total: 0, matched: 0 };
    const improved = (mostImproved || [])
      .map(r => ({ admin: r.admin, first_half: r.first_half, second_half: r.second_half, delta: (r.second_half ?? 0) - (r.first_half ?? 0) }))
      .filter(r => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 10);

    return Response.json({
      range: { from, to },
      totals: totals[0] || { total: 0, avg_score: 0 },
      // Admin Dashboard
      skill_radar: skillRadar[0] || {},
      trend,
      commission_distribution: commissionDist[0] || {},
      // Manager Dashboard
      category_scores: categoryScores,
      bottleneck: [...categoryScores].sort((a, b) => a.avg_score - b.avg_score).slice(0, 3),
      sop_coverage: { total: cov.total, matched: cov.matched, percent: cov.total ? Math.round((cov.matched / cov.total) * 100) : 0 },
      fatal_errors: fatalErrors[0]?.n || 0,
      minor_errors: minorErrors[0]?.n || 0,
      intent_distribution: intentDist,
      // Leaderboard
      admin_ranking: adminRanking,
      most_improved: improved,
      // Coaching
      coaching_recommendations: coaching,
      // Marketing Dashboard
      marketing: { events: marketing },
    });
  } catch (e) {
    return Response.json({ error: e.message, hint: 'อาจยังไม่ได้รัน POST /api/admin/import-sop (migration v3)' }, { status: 500 });
  }
}

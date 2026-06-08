import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// แดชบอร์ด QC เชิงลึก (SOP/intent/fatal/coaching)
//   GET /api/qc/insights?from=2026-06-01&to=2026-06-09
export async function GET(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const to = searchParams.get('to') || new Date().toISOString().slice(0, 10);
  const from = searchParams.get('from') || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

  try {
    const fromTs = `${from} 00:00:00`;
    const toTs = `${to} 23:59:59`;

    const [
      categoryScores, fatalErrors, minorErrors, sopCoverage,
      adminRanking, intentDist, coaching, totals,
    ] = await Promise.all([
      // คะแนนเฉลี่ยรายหมวด (intent)
      query`SELECT COALESCE(intent,'general') AS intent, count(*)::int AS n, round(avg(final_score))::int AS avg_score,
                   sum(CASE WHEN is_fatal THEN 1 ELSE 0 END)::int AS fatal
            FROM qc_scores WHERE created_at BETWEEN ${fromTs} AND ${toTs}
            GROUP BY 1 ORDER BY n DESC`,
      // fatal errors
      query`SELECT count(*)::int n FROM qc_scores WHERE is_fatal = true AND created_at BETWEEN ${fromTs} AND ${toTs}`,
      // minor errors (50-69 ไม่ fatal)
      query`SELECT count(*)::int n FROM qc_scores WHERE is_fatal = false AND final_score BETWEEN 50 AND 69 AND created_at BETWEEN ${fromTs} AND ${toTs}`,
      // SOP coverage
      query`SELECT count(*)::int total, sum(CASE WHEN matched_sop_id IS NOT NULL THEN 1 ELSE 0 END)::int matched
            FROM qc_scores WHERE created_at BETWEEN ${fromTs} AND ${toTs}`,
      // admin ranking
      query`SELECT a.member_name AS admin, count(*)::int AS replies, round(avg(q.final_score))::int AS avg_score,
                   sum(CASE WHEN q.is_fatal THEN 1 ELSE 0 END)::int AS fatal
            FROM qc_scores q JOIN qc_admins a ON a.id = q.admin_id
            WHERE q.created_at BETWEEN ${fromTs} AND ${toTs}
            GROUP BY a.member_name HAVING count(*) > 0 ORDER BY avg_score DESC, replies DESC LIMIT 50`,
      // intent distribution
      query`SELECT COALESCE(intent,'general') AS intent, count(*)::int AS n
            FROM qc_scores WHERE created_at BETWEEN ${fromTs} AND ${toTs} GROUP BY 1 ORDER BY n DESC`,
      // coaching recommendations (เคสคะแนนต่ำล่าสุดที่มี coaching)
      query`SELECT q.id, q.final_score, q.intent, q.is_fatal, q.coaching, a.member_name AS admin, q.created_at
            FROM qc_scores q LEFT JOIN qc_admins a ON a.id = q.admin_id
            WHERE q.coaching IS NOT NULL AND q.created_at BETWEEN ${fromTs} AND ${toTs}
            ORDER BY q.created_at DESC LIMIT 30`,
      // totals
      query`SELECT count(*)::int total, round(avg(final_score))::int avg_score FROM qc_scores WHERE created_at BETWEEN ${fromTs} AND ${toTs}`,
    ]);

    const cov = sopCoverage[0] || { total: 0, matched: 0 };
    return Response.json({
      range: { from, to },
      totals: totals[0] || { total: 0, avg_score: 0 },
      category_scores: categoryScores,
      fatal_errors: fatalErrors[0]?.n || 0,
      minor_errors: minorErrors[0]?.n || 0,
      sop_coverage: { total: cov.total, matched: cov.matched, percent: cov.total ? Math.round((cov.matched / cov.total) * 100) : 0 },
      admin_ranking: adminRanking,
      intent_distribution: intentDist,
      coaching_recommendations: coaching,
    });
  } catch (e) {
    return Response.json({ error: e.message, hint: 'อาจยังไม่ได้รัน POST /api/admin/import-sop (migration v3)' }, { status: 500 });
  }
}

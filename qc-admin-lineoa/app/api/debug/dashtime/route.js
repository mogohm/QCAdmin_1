import { query } from "@/lib/db";
import { requireView, unauthorized } from "@/lib/guard";

// GET /api/debug/dashtime?from=&to= — จับเวลาแต่ละ query หลักของ dashboard เพื่อหา bottleneck
export async function GET(req) {
  if (!requireView(req)) return unauthorized();
  const { searchParams } = new URL(req.url);
  const f = searchParams.get("from") || "2026-06-11";
  const t = searchParams.get("to") || "2026-06-18";

  const time = async (label, fn) => {
    const s = Date.now();
    try {
      const r = await fn();
      return {
        label,
        ms: Date.now() - s,
        rows: Array.isArray(r) ? r.length : 1,
      };
    } catch (e) {
      return { label, ms: Date.now() - s, error: e.message };
    }
  };

  const results = [];
  results.push(
    await time(
      "kpi_avg",
      () =>
        query`SELECT coalesce(avg(final_score),0)::int a FROM qc_scores WHERE created_at BETWEEN ${f}::date AND (${t}::date + interval '1 day')`,
    ),
  );
  results.push(
    await time(
      "ranking_join",
      () => query`
      SELECT a.id, count(q.id)::int cases, coalesce(avg(q.final_score),0)::int avg
      FROM qc_admins a
      LEFT JOIN (SELECT q.* FROM qc_scores q JOIN messages mq ON mq.id=q.admin_message_id
        WHERE mq.created_at BETWEEN ${f}::date AND (${t}::date + interval '1 day')) q ON q.admin_id=a.id
      WHERE a.is_active=true GROUP BY a.id`,
    ),
  );
  results.push(
    await time(
      "ranking_events_subq",
      () => query`
      SELECT a.id,
        (SELECT count(*)::int FROM customer_events ce WHERE ce.metadata->>'admin_id'=a.id::text AND ce.event_type='register'
           AND ce.created_at BETWEEN ${f}::date AND (${t}::date + interval '1 day')) reg,
        (SELECT coalesce(sum(ce.amount),0)::numeric FROM customer_events ce WHERE ce.metadata->>'admin_id'=a.id::text AND ce.event_type='deposit'
           AND ce.created_at BETWEEN ${f}::date AND (${t}::date + interval '1 day')) dep
      FROM qc_admins a WHERE a.is_active=true`,
    ),
  );
  results.push(
    await time(
      "replyLog_topcust",
      () => query`
      WITH top_customers AS (SELECT line_user_id, MAX(created_at) la FROM messages
        WHERE direction='admin' AND admin_id IS NOT NULL AND created_at BETWEEN ${f}::date AND (${t}::date + interval '1 day')
        GROUP BY line_user_id ORDER BY la DESC LIMIT 100)
      SELECT m.id FROM messages m JOIN top_customers tc ON tc.line_user_id=m.line_user_id
      WHERE m.direction='admin' AND m.admin_id IS NOT NULL AND m.created_at BETWEEN ${f}::date AND (${t}::date + interval '1 day')`,
    ),
  );
  results.push(
    await time(
      "categorySummary",
      () => query`
      SELECT d.category_code, avg(d.raw_score)::int a FROM qc_score_details d
      JOIN qc_scores q ON q.id=d.qc_score_id
      WHERE q.created_at BETWEEN ${f}::date AND (${t}::date + interval '1 day') AND d.raw_score IS NOT NULL
      GROUP BY d.category_code`,
    ),
  );

  results.push(
    await time(
      "pendingReply_lateral",
      () => query`
      SELECT c.id FROM conversations c
      JOIN line_customers lc ON lc.line_user_id=c.line_user_id
      JOIN LATERAL (SELECT created_at, direction FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) m ON m.direction='customer'
      WHERE m.created_at > now() - interval '7 days' LIMIT 20`,
    ),
  );
  results.push(
    await time(
      "kpi_full",
      () => query`SELECT
        (SELECT count(DISTINCT m.line_user_id) FROM messages m WHERE m.created_at BETWEEN ${f}::date AND (${t}::date + interval '1 day'))::int customers,
        (SELECT coalesce(sum(amount),0) FROM customer_events WHERE event_type='deposit' AND created_at BETWEEN ${f}::date AND (${t}::date + interval '1 day'))::numeric dep`,
    ),
  );

  results.sort((a, b) => b.ms - a.ms);
  return Response.json({
    from: f,
    to: t,
    total_ms: results.reduce((s, r) => s + r.ms, 0),
    slowest: results,
  });
}

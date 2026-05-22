import { query } from '@/lib/db';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const to   = searchParams.get('to')   || new Date().toISOString().slice(0, 10);

  const [jobs, msgStats, customerStats, noteStats, dailyBreakdown, unknownAdminSamples, qcStats] = await Promise.all([
    query`
      SELECT id, date_from, date_to, status, total_chats, logged_count,
             started_at, finished_at, error_text
      FROM scraper_jobs ORDER BY created_at DESC LIMIT 10`,

    query`
      SELECT
        COUNT(*)::int                                                             AS total_admin_msgs,
        COUNT(CASE WHEN admin_id IS NOT NULL THEN 1 END)::int                    AS with_admin_id,
        COUNT(CASE WHEN admin_id IS NULL     THEN 1 END)::int                    AS unknown_admin,
        COUNT(DISTINCT line_user_id)::int                                         AS distinct_customers
      FROM messages
      WHERE direction = 'admin'
        AND created_at >= ${from}::date
        AND created_at <  (${to}::date + interval '1 day')`,

    query`
      SELECT
        COUNT(*)::int                                                             AS total,
        COUNT(CASE WHEN display_name IS NOT NULL
                        AND length(display_name) > 2
                        AND display_name NOT SIMILAR TO 'U[0-9a-f]{8}%'
               THEN 1 END)::int                                                  AS with_real_name,
        COUNT(CASE WHEN display_name IS NULL
                     OR length(display_name) <= 2 THEN 1 END)::int              AS no_name,
        COUNT(CASE WHEN display_name SIMILAR TO 'U[0-9a-f]{8}%' THEN 1 END)::int AS name_is_id
      FROM line_customers`,

    query`
      SELECT
        COUNT(*)::int                                                             AS total_notes,
        COUNT(CASE WHEN noted_at IS NOT NULL THEN 1 END)::int                    AS with_date,
        COUNT(CASE WHEN noted_by IS NOT NULL THEN 1 END)::int                    AS with_author,
        MAX(scraped_at) AS last_scraped
      FROM customer_notes`,

    query`
      SELECT
        created_at::date           AS day,
        COUNT(*)::int              AS total,
        COUNT(CASE WHEN admin_id IS NULL THEN 1 END)::int AS unknown_admin,
        COUNT(DISTINCT line_user_id)::int                 AS customers
      FROM messages
      WHERE direction = 'admin'
        AND created_at >= ${from}::date
        AND created_at <  (${to}::date + interval '1 day')
      GROUP BY day ORDER BY day DESC LIMIT 14`,

    query`
      SELECT m.id, m.line_user_id, m.message_text, m.created_at,
             lc.display_name
      FROM messages m
      LEFT JOIN line_customers lc ON lc.line_user_id = m.line_user_id
      WHERE m.direction = 'admin'
        AND m.admin_id IS NULL
        AND m.created_at >= ${from}::date
        AND m.created_at <  (${to}::date + interval '1 day')
      ORDER BY m.created_at DESC LIMIT 5`,

    query`
      SELECT
        COUNT(q.id)::int                                                          AS total_scored,
        COUNT(CASE WHEN q.final_score >= 85 THEN 1 END)::int                     AS good,
        COUNT(CASE WHEN q.final_score >= 70 AND q.final_score < 85 THEN 1 END)::int AS warn,
        COUNT(CASE WHEN q.final_score < 70  THEN 1 END)::int                     AS bad,
        COALESCE(AVG(q.final_score), 0)::int                                     AS avg_score,
        COUNT(CASE WHEN q.customer_message_id IS NULL THEN 1 END)::int           AS no_customer_msg
      FROM qc_scores q
      JOIN messages m ON m.id = q.admin_message_id
      WHERE m.created_at >= ${from}::date
        AND m.created_at <  (${to}::date + interval '1 day')`,
  ]);

  return Response.json({
    from, to,
    jobs,
    msgStats:            msgStats[0]     || {},
    customerStats:       customerStats[0] || {},
    noteStats:           noteStats[0]     || {},
    qcStats:             qcStats[0]       || {},
    dailyBreakdown,
    unknownAdminSamples,
  });
}

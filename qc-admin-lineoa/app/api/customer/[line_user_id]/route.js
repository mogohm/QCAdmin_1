import { query } from '@/lib/db';

export async function GET(req, { params }) {
  try {
    const { line_user_id } = await params;
    if (!line_user_id) return Response.json({ error: 'line_user_id required' }, { status: 400 });

    const [customer, events, conversations, stats] = await Promise.all([
      query`SELECT * FROM line_customers WHERE line_user_id = ${line_user_id}`,

      query`
        SELECT id, event_type, status, amount, promotion_code, metadata, created_at
        FROM customer_events
        WHERE line_user_id = ${line_user_id}
        ORDER BY created_at DESC
      `,

      query`
        SELECT
          c.id, c.status, c.opened_at, c.closed_at,
          a.member_name                                                         AS admin_name,
          COUNT(m.id) FILTER (WHERE m.direction = 'admin')::int                AS admin_msgs,
          COUNT(m.id) FILTER (WHERE m.direction = 'customer')::int             AS cust_msgs,
          COALESCE(AVG(qs.final_score), 0)::int                                AS avg_score,
          COUNT(qs.id) FILTER (WHERE qs.final_score >= 85)::int                AS good,
          COUNT(qs.id) FILTER (WHERE qs.final_score >= 70 AND qs.final_score < 85)::int AS warn,
          COUNT(qs.id) FILTER (WHERE qs.final_score < 70 AND qs.final_score IS NOT NULL)::int AS bad
        FROM conversations c
        LEFT JOIN qc_admins a  ON a.id = c.assigned_admin_id
        LEFT JOIN messages m   ON m.conversation_id = c.id
        LEFT JOIN qc_scores qs ON qs.conversation_id = c.id
        WHERE c.line_user_id = ${line_user_id}
        GROUP BY c.id, c.status, c.opened_at, c.closed_at, a.member_name
        ORDER BY c.opened_at DESC
        LIMIT 50
      `,

      query`
        SELECT
          COUNT(qs.id)::int                                                      AS total_scores,
          COALESCE(AVG(qs.final_score), 0)::int                                 AS avg_score,
          COALESCE(MIN(qs.final_score), 0)::int                                 AS min_score,
          COALESCE(MAX(qs.final_score), 0)::int                                 AS max_score,
          COUNT(qs.id) FILTER (WHERE qs.final_score >= 85)::int                 AS good,
          COUNT(qs.id) FILTER (WHERE qs.final_score >= 70 AND qs.final_score < 85)::int AS warn,
          COUNT(qs.id) FILTER (WHERE qs.final_score < 70)::int                  AS bad,
          COALESCE(AVG(qs.response_seconds) FILTER (WHERE qs.response_seconds > 0), 0)::int AS avg_response_sec
        FROM qc_scores qs
        JOIN conversations c ON c.id = qs.conversation_id
        WHERE c.line_user_id = ${line_user_id}
      `,
    ]);

    return Response.json({
      customer: customer[0] || null,
      events,
      conversations,
      stats: stats[0] || null,
    });
  } catch (err) {
    console.error('Customer API error:', err);
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

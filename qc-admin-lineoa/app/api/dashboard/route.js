import { query } from '@/lib/db';

export async function GET() {
  try {
    const kpi = await query`SELECT
      (SELECT count(*) FROM line_customers)::int AS customers,
      (SELECT count(*) FROM customer_events WHERE event_type='register' AND status='pass')::int AS registered_pass,
      (SELECT count(*) FROM customer_events WHERE event_type='kyc' AND status='pass')::int AS kyc_pass,
      (SELECT coalesce(sum(amount),0) FROM customer_events WHERE event_type='deposit')::numeric AS deposit_total,
      (SELECT coalesce(avg(response_seconds),0)::int FROM qc_scores) AS avg_response_sec,
      (SELECT coalesce(avg(final_score),0)::int FROM qc_scores) AS avg_score`;

    const ranking = await query`
      SELECT
        a.id, a.member_name,
        count(q.id)::int                              AS cases,
        coalesce(avg(q.final_score),0)::int           AS avg_score,
        coalesce(avg(q.response_seconds),0)::int      AS avg_response_sec,
        count(q.id) FILTER (WHERE q.final_score >= 85)::int  AS good,
        count(q.id) FILTER (WHERE q.final_score >= 70 AND q.final_score < 85)::int AS warn,
        count(q.id) FILTER (WHERE q.final_score < 70)::int   AS bad,
        max(q.created_at) AS last_reply_at
      FROM qc_admins a
      LEFT JOIN qc_scores q ON q.admin_id = a.id
      WHERE a.is_active = true
      GROUP BY a.id, a.member_name
      ORDER BY avg_score DESC, cases DESC
      LIMIT 20`;

    const promos = await query`
      SELECT promotion_code, count(*)::int customer_count, coalesce(sum(amount),0)::numeric total_amount
      FROM customer_events WHERE promotion_code IS NOT NULL
      GROUP BY promotion_code ORDER BY total_amount DESC LIMIT 20`;

    const openCases = await query`
      SELECT c.id, c.opened_at, lc.display_name, lc.line_user_id, m.message_text
      FROM conversations c
      JOIN line_customers lc ON lc.line_user_id = c.line_user_id
      LEFT JOIN LATERAL (
        SELECT message_text FROM messages
        WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
      ) m ON true
      WHERE c.status = 'open'
      ORDER BY c.opened_at DESC LIMIT 30`;

    // Admin reply log — ใครตอบอะไร เมื่อไหร่ คะแนนเท่าไหร่
    const replyLog = await query`
      SELECT
        m.id,
        m.created_at,
        a.member_name                     AS admin_name,
        lc.display_name                   AS customer_name,
        m.line_user_id,
        m.message_text                    AS reply_text,
        cust.message_text                 AS customer_text,
        q.final_score,
        q.speed_score,
        q.correctness_score,
        q.sentiment_score,
        q.response_seconds,
        q.fail_reasons,
        q.matched_rules
      FROM messages m
      JOIN qc_admins a        ON a.id = m.admin_id
      JOIN line_customers lc  ON lc.line_user_id = m.line_user_id
      LEFT JOIN qc_scores q   ON q.admin_message_id = m.id
      LEFT JOIN messages cust ON cust.id = q.customer_message_id
      WHERE m.direction = 'admin'
      ORDER BY m.created_at DESC
      LIMIT 50`;

    // Last activity timestamps
    const lastActivity = await query`
      SELECT
        (SELECT max(created_at) FROM messages WHERE direction = 'customer') AS last_customer_msg,
        (SELECT max(created_at) FROM messages WHERE direction = 'admin')    AS last_admin_reply,
        (SELECT max(created_at) FROM line_customers)                        AS last_new_customer,
        now() AS server_time`;

    return Response.json({ kpi: kpi[0], ranking, promos, openCases, replyLog, lastActivity: lastActivity[0] });
  } catch (err) {
    console.error('Dashboard error:', err);
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

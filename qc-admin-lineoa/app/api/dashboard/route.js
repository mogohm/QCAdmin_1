import { query } from '@/lib/db';

async function safe(fn, fb) {
  try { return await fn(); } catch (e) { console.error('query:', e.message); return fb; }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('from') || '2000-01-01';
  const dateTo   = searchParams.get('to')   || '2099-12-31';

  try {
    const [kpiRows, rankingAll, weeklySummary, promos, pendingReply, replyLog, lastActivity] = await Promise.all([

      // KPI — กรองตามวันที่
      safe(() => query`SELECT
        (SELECT count(DISTINCT m.line_user_id) FROM messages m
         WHERE m.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day'))::int AS customers,
        (SELECT count(*) FROM customer_events
         WHERE event_type='register' AND status='pass'
           AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day'))::int AS registered_pass,
        (SELECT count(*) FROM customer_events
         WHERE event_type='kyc' AND status='pass'
           AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day'))::int AS kyc_pass,
        (SELECT coalesce(sum(amount),0) FROM customer_events
         WHERE event_type='deposit'
           AND created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day'))::numeric AS deposit_total,
        (SELECT coalesce(avg(q.response_seconds) FILTER (WHERE q.response_seconds > 0),0)::int
         FROM qc_scores q WHERE q.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')) AS avg_response_sec,
        (SELECT coalesce(avg(q.final_score),0)::int
         FROM qc_scores q WHERE q.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')) AS avg_score`, [{}]),

      // Ranking ทั้งหมด (frontend แสดง 10 + toggle)
      safe(() => query`
        SELECT
          a.id, a.member_name,
          count(q.id)::int                                                              AS cases,
          coalesce(avg(q.final_score),0)::int                                           AS avg_score,
          coalesce(avg(q.response_seconds) FILTER (WHERE q.response_seconds > 0),0)::int AS avg_response_sec,
          (count(q.id) FILTER (WHERE q.final_score >= 85))::int                         AS good,
          (count(q.id) FILTER (WHERE q.final_score >= 70 AND q.final_score < 85))::int  AS warn,
          (count(q.id) FILTER (WHERE q.final_score < 70 AND q.final_score IS NOT NULL))::int AS bad,
          max(q.created_at) AS last_reply_at,
          (SELECT count(*)::int FROM customer_events ce
           WHERE ce.metadata->>'admin_id' = a.id::text
             AND ce.event_type = 'register'
             AND ce.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
          ) AS reg_count,
          (SELECT coalesce(sum(ce.amount),0)::numeric FROM customer_events ce
           WHERE ce.metadata->>'admin_id' = a.id::text
             AND ce.event_type = 'deposit'
             AND ce.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
          ) AS deposit_sum
        FROM qc_admins a
        LEFT JOIN (
          SELECT q.* FROM qc_scores q
          JOIN messages mq ON mq.id = q.admin_message_id
          WHERE mq.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
        ) q ON q.admin_id = a.id
        WHERE a.is_active = true
        GROUP BY a.id, a.member_name
        ORDER BY avg_score DESC, cases DESC`, []),

      // Daily summary — แบ่งตามวัน 28 วันล่าสุด
      safe(() => query`
        SELECT
          m.created_at::date                                                             AS day,
          count(q.id)::int                                                               AS total_cases,
          coalesce(avg(q.final_score),0)::int                                            AS avg_score,
          coalesce(avg(q.response_seconds) FILTER (WHERE q.response_seconds > 0),0)::int AS avg_response_sec,
          (count(q.id) FILTER (WHERE q.final_score >= 85))::int                          AS good,
          (count(q.id) FILTER (WHERE q.final_score < 70 AND q.final_score IS NOT NULL))::int AS bad,
          count(DISTINCT q.admin_id)::int                                                AS active_admins
        FROM qc_scores q
        JOIN messages m ON m.id = q.admin_message_id
        WHERE m.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
        GROUP BY m.created_at::date
        ORDER BY day DESC
        LIMIT 28`, []),

      safe(() => query`
        SELECT promotion_code, count(*)::int customer_count, coalesce(sum(amount),0)::numeric total_amount
        FROM customer_events WHERE promotion_code IS NOT NULL
        GROUP BY promotion_code ORDER BY total_amount DESC LIMIT 20`, []),

      // Pending Reply — conversations ที่ last message เป็นลูกค้า (admin ยังไม่ตอบ)
      safe(() => query`
        SELECT c.id, lc.display_name, lc.line_user_id,
          m.message_text AS last_customer_msg,
          m.created_at AS waiting_since,
          EXTRACT(EPOCH FROM (now() - m.created_at))/60 AS waiting_minutes,
          qa.member_name AS assigned_admin
        FROM conversations c
        JOIN line_customers lc ON lc.line_user_id = c.line_user_id
        JOIN LATERAL (
          SELECT message_text, created_at, direction
          FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
        ) m ON m.direction = 'customer'
        LEFT JOIN qc_admins qa ON qa.id = c.assigned_admin_id
        ORDER BY m.created_at ASC
        LIMIT 20`, []),

      safe(() => query`
        SELECT
          m.id, m.created_at,
          a.member_name     AS admin_name,
          lc.display_name   AS customer_name,
          m.line_user_id,
          m.message_text    AS reply_text,
          cust.message_text AS customer_text,
          q.final_score, q.speed_score, q.correctness_score,
          q.sentiment_score, q.response_seconds,
          q.fail_reasons, q.matched_rules
        FROM messages m
        LEFT JOIN qc_admins a       ON a.id = m.admin_id
        LEFT JOIN line_customers lc ON lc.line_user_id = m.line_user_id
        LEFT JOIN qc_scores q       ON q.admin_message_id = m.id
        LEFT JOIN messages cust     ON cust.id = q.customer_message_id
        WHERE m.direction = 'admin'
          AND m.admin_id IS NOT NULL
          AND m.created_at BETWEEN ${dateFrom}::date AND (${dateTo}::date + interval '1 day')
        ORDER BY m.created_at DESC LIMIT 100`, []),

      safe(() => query`
        SELECT
          (SELECT max(created_at) FROM messages WHERE direction='customer') AS last_customer_msg,
          (SELECT max(created_at) FROM messages WHERE direction='admin')    AS last_admin_reply,
          (SELECT max(first_seen_at) FROM line_customers)                   AS last_new_customer,
          now() AS server_time`, [{}]),
    ]);

    return Response.json({
      kpi: kpiRows[0] || {},
      ranking: rankingAll,
      weeklySummary,
      promos,
      pendingReply,
      replyLog,
      lastActivity: lastActivity[0] || {},
    });
  } catch (err) {
    console.error('Dashboard fatal:', err);
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

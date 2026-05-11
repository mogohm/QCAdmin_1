import { query } from '@/lib/db';

export async function GET(req, { params }) {
  const { line_user_id } = params;

  const [customer, messages] = await Promise.all([
    query`SELECT * FROM line_customers WHERE line_user_id = ${line_user_id}`,
    query`
      SELECT
        m.id, m.direction, m.message_text, m.created_at,
        a.member_name AS admin_name,
        q.final_score, q.speed_score, q.correctness_score, q.sentiment_score,
        q.response_seconds, q.fail_reasons, q.matched_rules,
        cust.message_text AS paired_customer_text
      FROM messages m
      LEFT JOIN qc_admins a    ON a.id = m.admin_id
      LEFT JOIN qc_scores q    ON q.admin_message_id = m.id
      LEFT JOIN messages cust  ON cust.id = q.customer_message_id
      WHERE m.line_user_id = ${line_user_id}
      ORDER BY m.created_at ASC
      LIMIT 500
    `,
  ]);

  return Response.json({ customer: customer[0] || null, messages });
}

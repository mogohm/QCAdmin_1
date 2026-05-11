import { query } from '@/lib/db';

export async function GET(req, { params }) {
  const { line_user_id } = params;

  const [customer, messages] = await Promise.all([
    query`SELECT * FROM line_customers WHERE line_user_id = ${line_user_id}`,

    // dedup: webhook และ scraper อาจ insert ข้อความลูกค้าเดียวกัน
    // ใช้ DISTINCT ON (direction, message_text, ช่วงเวลา 5 นาที) เก็บ message แรกสุด
    // จากนั้น join คะแนน QC และ customer_message ที่จับคู่ไว้
    query`
      WITH deduped AS (
        SELECT DISTINCT ON (direction, message_text, date_trunc('hour', created_at))
          id, direction, message_text, created_at, admin_id
        FROM messages
        WHERE line_user_id = ${line_user_id}
        ORDER BY direction, message_text, date_trunc('hour', created_at), created_at ASC
      )
      SELECT
        d.id, d.direction, d.message_text, d.created_at,
        a.member_name       AS admin_name,
        q.final_score, q.speed_score, q.correctness_score, q.sentiment_score,
        q.response_seconds, q.fail_reasons, q.matched_rules,
        cust.message_text   AS paired_customer_text
      FROM deduped d
      LEFT JOIN qc_admins a   ON a.id = d.admin_id
      LEFT JOIN qc_scores q   ON q.admin_message_id = d.id
      LEFT JOIN messages cust ON cust.id = q.customer_message_id
      ORDER BY d.created_at ASC
      LIMIT 500
    `,
  ]);

  return Response.json({ customer: customer[0] || null, messages });
}

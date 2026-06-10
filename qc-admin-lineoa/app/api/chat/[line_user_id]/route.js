import { query } from '@/lib/db';

export async function GET(req, { params }) {
  try {
  const { line_user_id } = await params;

  if (!line_user_id) {
    return Response.json({ error: 'line_user_id required', customer: null, messages: [] }, { status: 400 });
  }

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
        q.id                AS qc_score_id,
        q.final_score, q.speed_score, q.correctness_score, q.sentiment_score,
        q.response_seconds, q.fail_reasons, q.matched_rules,
        q.intent, q.is_fatal, q.sla_exception, q.dimension_scores, q.coaching,
        q.matched_sop_id, q.sop_confidence, q.evidence, q.minor_issues,
        COALESCE(q.matched_sop_topic, sop.topic)   AS matched_sop_topic,
        COALESCE(q.expected_sop_answer, sop.answer) AS expected_sop_answer,
        (SELECT json_agg(json_build_object('category_code',category_code,'raw_score',raw_score,
           'weighted_score',weighted_score,'max_score',max_score,'pass',pass,'fail_reason',fail_reason,
           'suggestion',suggestion,'evidence',evidence) ORDER BY id)
         FROM qc_score_details WHERE qc_score_id = q.id) AS score_details,
        (SELECT status FROM qc_disputes WHERE qc_score_id = q.id ORDER BY created_at DESC LIMIT 1) AS dispute_status,
        cust.message_text   AS paired_customer_text
      FROM deduped d
      LEFT JOIN qc_admins a   ON a.id = d.admin_id
      LEFT JOIN qc_scores q   ON q.admin_message_id = d.id
      LEFT JOIN sop_scripts sop ON sop.id = q.matched_sop_id
      LEFT JOIN messages cust ON cust.id = q.customer_message_id
      ORDER BY d.created_at ASC
      LIMIT 500
    `,
  ]);

  return Response.json({ customer: customer[0] || null, messages });
  } catch (err) {
    console.error('Chat API error:', err);
    return Response.json({ error: String(err.message || err), customer: null, messages: [] }, { status: 500 });
  }
}

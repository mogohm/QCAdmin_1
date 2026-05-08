import { query } from '@/lib/db';
export async function GET() {
  const kpi = await query`SELECT
    (SELECT count(*) FROM line_customers)::int AS customers,
    (SELECT count(*) FROM customer_events WHERE event_type='register' AND status='pass')::int AS registered_pass,
    (SELECT count(*) FROM customer_events WHERE event_type='kyc' AND status='pass')::int AS kyc_pass,
    (SELECT coalesce(sum(amount),0) FROM customer_events WHERE event_type='deposit')::numeric AS deposit_total,
    (SELECT coalesce(avg(response_seconds),0)::int FROM qc_scores) AS avg_response_sec,
    (SELECT coalesce(avg(final_score),0)::int FROM qc_scores) AS avg_score`;
  const ranking = await query`SELECT a.id,a.member_name, count(q.id)::int cases, coalesce(avg(q.final_score),0)::int avg_score, coalesce(avg(q.response_seconds),0)::int avg_response_sec
    FROM qc_admins a LEFT JOIN qc_scores q ON q.admin_id=a.id WHERE a.is_active=true GROUP BY a.id,a.member_name ORDER BY avg_score DESC, cases DESC LIMIT 20`;
  const promos = await query`SELECT promotion_code, count(*)::int customer_count, coalesce(sum(amount),0)::numeric total_amount FROM customer_events WHERE promotion_code IS NOT NULL GROUP BY promotion_code ORDER BY total_amount DESC LIMIT 20`;
  const openCases = await query`SELECT c.id,c.opened_at,lc.display_name,lc.line_user_id,m.message_text FROM conversations c JOIN line_customers lc ON lc.line_user_id=c.line_user_id LEFT JOIN LATERAL (SELECT message_text FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) m ON true WHERE c.status='open' ORDER BY c.opened_at DESC LIMIT 30`;
  return Response.json({ kpi:kpi[0], ranking, promos, openCases });
}

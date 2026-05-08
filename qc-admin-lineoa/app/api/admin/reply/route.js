import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { pushLineText } from '@/lib/line';
import { scoreReply } from '@/lib/qc-engine';
import { sendTelegram } from '@/lib/telegram';

export async function POST(req) {
  if (!requireAdmin(req)) return Response.json({error:'unauthorized'}, {status:401});
  const { conversation_id, admin_id, text, send_line=true } = await req.json();
  if (!conversation_id || !admin_id || !text) return Response.json({error:'conversation_id, admin_id, text required'}, {status:400});

  const conv = await query`SELECT c.*, lc.line_user_id FROM conversations c JOIN line_customers lc ON lc.line_user_id=c.line_user_id WHERE c.id=${conversation_id}`;
  if (!conv[0]) return Response.json({error:'conversation not found'}, {status:404});

  const lastCustomer = await query`SELECT * FROM messages WHERE conversation_id=${conversation_id} AND direction='customer' ORDER BY created_at DESC LIMIT 1`;
  if (send_line) await pushLineText(conv[0].line_user_id, text);

  const adminMsg = await query`INSERT INTO messages(conversation_id,line_user_id,admin_id,direction,message_text)
    VALUES(${conversation_id},${conv[0].line_user_id},${admin_id},'admin',${text}) RETURNING *`;
  await query`UPDATE conversations SET assigned_admin_id=${admin_id} WHERE id=${conversation_id}`;

  let qc = null;
  if (lastCustomer[0]) {
    const settings = await query`SELECT value FROM app_settings WHERE key='response_limit_minutes'`;
    const rules = await query`SELECT rule_code,rule_name,category,question_keywords,answer_keywords FROM knowledge_rules WHERE is_active=true`;
    const diff = await query`SELECT EXTRACT(EPOCH FROM (${adminMsg[0].created_at}::timestamptz - ${lastCustomer[0].created_at}::timestamptz))::int AS sec`;
    qc = scoreReply({ customerText:lastCustomer[0].message_text, adminText:text, responseSeconds:diff[0].sec, responseLimitMinutes:settings[0]?.value || process.env.QC_RESPONSE_LIMIT_MINUTES || 5, rules });
    const scoreRow = await query`INSERT INTO qc_scores(conversation_id,customer_message_id,admin_message_id,admin_id,response_seconds,speed_score,correctness_score,sentiment_score,final_score,fail_reasons,matched_rules)
      VALUES(${conversation_id},${lastCustomer[0].id},${adminMsg[0].id},${admin_id},${diff[0].sec},${qc.speedScore},${qc.correctnessScore},${qc.sentimentScore},${qc.finalScore},${JSON.stringify(qc.failReasons)},${JSON.stringify(qc.matchedRules)}) RETURNING *`;
    qc.id = scoreRow[0].id;
    if (qc.finalScore < 70 || qc.failReasons.length) await sendTelegram(`QC FAIL: score ${qc.finalScore}\n${qc.failReasons.join(', ')}\nAdmin: ${admin_id}`);
  }
  return Response.json({ ok:true, qc });
}

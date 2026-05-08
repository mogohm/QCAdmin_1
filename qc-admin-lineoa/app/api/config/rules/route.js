import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
export async function GET(){ return Response.json(await query`SELECT * FROM knowledge_rules ORDER BY category, rule_code`); }
export async function POST(req){
 if(!requireAdmin(req)) return Response.json({error:'unauthorized'},{status:401});
 const r=await req.json();
 const rows=await query`INSERT INTO knowledge_rules(rule_code,rule_name,category,question_keywords,answer_keywords,weight,is_active)
 VALUES(${r.rule_code},${r.rule_name},${r.category},${JSON.stringify(r.question_keywords||[])},${JSON.stringify(r.answer_keywords||[])},${r.weight||1},${r.is_active!==false})
 ON CONFLICT(rule_code) DO UPDATE SET rule_name=EXCLUDED.rule_name,category=EXCLUDED.category,question_keywords=EXCLUDED.question_keywords,answer_keywords=EXCLUDED.answer_keywords,weight=EXCLUDED.weight,is_active=EXCLUDED.is_active RETURNING *`;
 return Response.json(rows[0]);
}

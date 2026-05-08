import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
export async function POST(req){
 if(!requireAdmin(req)) return Response.json({error:'unauthorized'},{status:401});
 const {line_user_id,event_type,status,amount,promotion_code,metadata={}}=await req.json();
 if(!line_user_id||!event_type) return Response.json({error:'line_user_id,event_type required'},{status:400});
 await query`INSERT INTO line_customers(line_user_id) VALUES(${line_user_id}) ON CONFLICT(line_user_id) DO NOTHING`;
 const rows=await query`INSERT INTO customer_events(line_user_id,event_type,status,amount,promotion_code,metadata) VALUES(${line_user_id},${event_type},${status||null},${amount||null},${promotion_code||null},${JSON.stringify(metadata)}) RETURNING *`;
 if(event_type==='deposit') await query`UPDATE line_customers SET deposit_amount=deposit_amount+${amount||0}, promotion_code=COALESCE(${promotion_code||null},promotion_code) WHERE line_user_id=${line_user_id}`;
 return Response.json(rows[0]);
}

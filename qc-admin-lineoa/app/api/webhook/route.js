import { query } from '@/lib/db';
import { verifyLineSignature, getLineProfile } from '@/lib/line';

export async function POST(req) {
  const raw = await req.text();
  const sig = req.headers.get('x-line-signature');
  if (!verifyLineSignature(raw, sig)) return Response.json({ error: 'invalid signature' }, { status: 401 });
  const body = JSON.parse(raw || '{}');

  for (const ev of body.events || []) {
    const userId = ev?.source?.userId;
    if (!userId) continue;
    let profile = null;
    if (ev.type === 'follow' || ev.type === 'message') profile = await getLineProfile(userId);
    await query`INSERT INTO line_customers(line_user_id, display_name, picture_url, last_seen_at)
      VALUES(${userId}, ${profile?.displayName || null}, ${profile?.pictureUrl || null}, now())
      ON CONFLICT(line_user_id) DO UPDATE SET display_name=COALESCE(EXCLUDED.display_name,line_customers.display_name), picture_url=COALESCE(EXCLUDED.picture_url,line_customers.picture_url), last_seen_at=now()`;

    if (ev.type === 'message' && ev.message?.type === 'text') {
      const open = await query`SELECT id FROM conversations WHERE line_user_id=${userId} AND status='open' ORDER BY opened_at DESC LIMIT 1`;
      let cid = open[0]?.id;
      if (!cid) {
        const rows = await query`INSERT INTO conversations(line_user_id) VALUES(${userId}) RETURNING id`;
        cid = rows[0].id;
      }
      await query`INSERT INTO messages(conversation_id,line_user_id,direction,message_text,line_message_id)
        VALUES(${cid},${userId},'customer',${ev.message.text},${ev.message.id || null})`;
    }
  }
  return Response.json({ ok: true });
}

export async function GET() { return Response.json({ ok: true, endpoint: 'LINE webhook active' }); }

import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

const isPK = (name='') => /^\s*PK/i.test(String(name).normalize('NFKC'));

export async function POST(req) {
  if (!requireAdmin(req)) return Response.json({error:'unauthorized'}, {status:401});
  const { text='', admins=[] } = await req.json();
  const names = admins.length ? admins : text.split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean);
  const pkNames = [...new Set(names.filter(isPK))];
  const saved = [];
  for (const name of pkNames) {
    const norm = name.normalize('NFKC').replace(/\s+/g,' ').trim();
    const rows = await query`INSERT INTO qc_admins(member_name, normalized_name)
      VALUES(${name},${norm})
      ON CONFLICT(normalized_name) DO UPDATE SET member_name=EXCLUDED.member_name,is_active=true
      RETURNING id, member_name`;
    saved.push(rows[0]);
  }
  return Response.json({ ok:true, count:saved.length, admins:saved });
}

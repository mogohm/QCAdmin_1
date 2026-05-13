import { sql } from '@/lib/db';

const SORT_COLS = {
  date:     'm.created_at',
  score:    'COALESCE(q.final_score, 0)',
  customer: 'COALESCE(lc.display_name, m.line_user_id)',
  admin:    'COALESCE(a.member_name, \'\')',
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const dateFrom  = searchParams.get('from')     || '2000-01-01';
  const dateTo    = searchParams.get('to')       || '2099-12-31';
  const page      = Math.max(1, parseInt(searchParams.get('page')  || '1'));
  const limit     = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
  const customer  = (searchParams.get('customer') || '').trim();
  const admin     = (searchParams.get('admin')    || '').trim();
  const sortKey   = searchParams.get('sort') || 'date';
  const order     = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
  const offset    = (page - 1) * limit;

  const sortCol   = SORT_COLS[sortKey] || SORT_COLS.date;
  const custPat   = customer ? `%${customer}%` : '%';
  const adminPat  = admin    ? `%${admin}%`    : '%';

  const db = sql();

  try {
    const baseWhere = `
      m.direction = 'admin'
      AND m.admin_id IS NOT NULL
      AND m.created_at BETWEEN $1::date AND ($2::date + interval '1 day')
      AND COALESCE(lc.display_name, m.line_user_id) ILIKE $3
      AND COALESCE(a.member_name, '') ILIKE $4
    `;
    const baseParams = [dateFrom, dateTo, custPat, adminPat];

    const [rows, countRows] = await Promise.all([
      db(
        `SELECT
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
        WHERE ${baseWhere}
        ORDER BY ${sortCol} ${order}, m.id DESC
        LIMIT $5 OFFSET $6`,
        [...baseParams, limit, offset]
      ),
      db(
        `SELECT count(*)::int AS total
        FROM messages m
        LEFT JOIN qc_admins a       ON a.id = m.admin_id
        LEFT JOIN line_customers lc ON lc.line_user_id = m.line_user_id
        WHERE ${baseWhere}`,
        baseParams
      ),
    ]);

    const total = countRows[0]?.total || 0;
    return Response.json({
      items: rows,
      total,
      pages: Math.ceil(total / limit),
      page,
      limit,
    });
  } catch (err) {
    console.error('replies:', err);
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

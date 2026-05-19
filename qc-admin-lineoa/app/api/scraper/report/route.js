import { query } from '@/lib/db';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// GET /api/scraper/report?from=YYYY-MM-DD&to=YYYY-MM-DD
// คืนข้อมูลสรุปการ scrape พร้อม messages + notes ต่อ customer
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const to   = searchParams.get('to')   || new Date().toISOString().slice(0, 10);

  const fromTs = `${from}T00:00:00`;
  const toTs   = `${to}T23:59:59`;

  // ดึง customers ที่มี messages ในช่วงนี้
  const customers = await query`
    SELECT DISTINCT lc.line_user_id, lc.display_name, lc.picture_url
    FROM line_customers lc
    JOIN conversations c ON c.line_user_id = lc.line_user_id
    JOIN messages m ON m.conversation_id = c.id
    WHERE m.created_at BETWEEN ${fromTs}::timestamptz AND ${toTs}::timestamptz
      AND m.direction = 'admin'
    ORDER BY lc.display_name
  `;

  // ดึง messages + QC score ต่อ customer
  const messages = await query`
    SELECT
      m.line_user_id,
      m.direction,
      m.message_text,
      m.created_at,
      a.member_name  AS admin_name,
      qs.final_score,
      qs.speed_score,
      qs.correctness_score,
      qs.sentiment_score,
      qs.response_seconds,
      qs.fail_reasons,
      qs.matched_rules,
      cm.message_text AS customer_text,
      cm.created_at   AS customer_created_at
    FROM messages m
    LEFT JOIN qc_admins a    ON a.id = m.admin_id
    LEFT JOIN qc_scores qs   ON qs.admin_message_id = m.id
    LEFT JOIN messages cm    ON cm.id = qs.customer_message_id
    WHERE m.created_at BETWEEN ${fromTs}::timestamptz AND ${toTs}::timestamptz
      AND m.direction = 'admin'
    ORDER BY m.line_user_id, m.created_at
  `;

  // ดึง notes ต่อ customer ที่ถูก scrape ในช่วงนี้
  const notes = await query`
    SELECT cn.line_user_id, cn.note_text, cn.noted_at, cn.noted_by, cn.scraped_at
    FROM customer_notes cn
    WHERE cn.scraped_at BETWEEN ${fromTs}::timestamptz AND ${toTs}::timestamptz
    ORDER BY cn.line_user_id, cn.noted_at DESC NULLS LAST
  `;

  // ดึง scraper jobs ในช่วงนี้
  const jobs = await query`
    SELECT id, date_from, date_to, status, total_chats, logged_count,
           started_at, finished_at, error_text
    FROM scraper_jobs
    WHERE created_at BETWEEN ${fromTs}::timestamptz AND ${toTs}::timestamptz
    ORDER BY created_at DESC
    LIMIT 20
  `;

  // จัดกลุ่ม messages และ notes ตาม customer
  const msgByCustomer  = {};
  const noteByCustomer = {};

  for (const m of messages) {
    if (!msgByCustomer[m.line_user_id])  msgByCustomer[m.line_user_id]  = [];
    msgByCustomer[m.line_user_id].push(m);
  }
  for (const n of notes) {
    if (!noteByCustomer[n.line_user_id]) noteByCustomer[n.line_user_id] = [];
    noteByCustomer[n.line_user_id].push(n);
  }

  const result = customers.map(c => ({
    ...c,
    messages: msgByCustomer[c.line_user_id]  || [],
    notes:    noteByCustomer[c.line_user_id] || [],
  }));

  // เพิ่ม customers ที่มี notes แต่ไม่มี messages (edge case)
  for (const [uid, ns] of Object.entries(noteByCustomer)) {
    if (!result.find(r => r.line_user_id === uid)) {
      result.push({ line_user_id: uid, display_name: null, picture_url: null, messages: [], notes: ns });
    }
  }

  return Response.json({
    from, to,
    jobs,
    total_customers: result.length,
    total_messages:  messages.length,
    total_notes:     notes.length,
    customers: result,
  }, { headers: CORS });
}

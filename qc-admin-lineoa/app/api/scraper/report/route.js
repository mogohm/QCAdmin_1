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
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const to   = searchParams.get('to')   || new Date().toISOString().slice(0, 10);

  // Explicit UTC to avoid Neon session-timezone ambiguity
  const fromTs = `${from}T00:00:00Z`;
  const toTs   = `${to}T23:59:59Z`;

  // ---- Jobs: กรองด้วย date_from/date_to ที่ job ถูก scrape ----
  // Bug เดิม: WHERE created_at → job สร้างวันนี้เพื่อ scrape วันเก่าจะไม่ขึ้น
  const jobs = await query`
    SELECT id, date_from, date_to, status, total_chats, logged_count,
           started_at, finished_at, error_text
    FROM scraper_jobs
    WHERE date_from <= ${to}::date AND date_to >= ${from}::date
    ORDER BY created_at DESC
    LIMIT 20
  `;

  // ---- Messages + customer info รวมใน query เดียว ----
  // เงื่อนไข OR สองแบบ:
  // 1. created_at ตรงกับช่วงวันที่ (scraper ส่ง timestamp ถูกต้อง)
  // 2. created_at อยู่ในช่วงที่ job รัน (scraper ไม่มี timestamp → ใช้ now() → ต้องหาจาก job window)
  const messages = await query`
    SELECT
      m.line_user_id,
      lc.display_name,
      lc.picture_url,
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
    LEFT JOIN line_customers lc ON lc.line_user_id = m.line_user_id
    LEFT JOIN qc_admins a  ON a.id = m.admin_id
    LEFT JOIN qc_scores qs ON qs.admin_message_id = m.id
    LEFT JOIN messages cm  ON cm.id = qs.customer_message_id
    WHERE m.direction = 'admin'
      AND (
        m.created_at BETWEEN ${fromTs}::timestamptz AND ${toTs}::timestamptz
        OR EXISTS (
          SELECT 1 FROM scraper_jobs sj
          WHERE sj.date_from <= ${to}::date
            AND sj.date_to   >= ${from}::date
            AND sj.started_at IS NOT NULL
            AND m.created_at >= sj.started_at
            AND m.created_at <= COALESCE(sj.finished_at, NOW()) + INTERVAL '10 minutes'
        )
      )
    ORDER BY m.line_user_id, m.created_at
  `;

  // ---- Notes: เงื่อนไขเดียวกับ messages ----
  const notes = await query`
    SELECT cn.line_user_id, cn.note_text, cn.noted_at, cn.noted_by, cn.scraped_at
    FROM customer_notes cn
    WHERE (
      cn.scraped_at BETWEEN ${fromTs}::timestamptz AND ${toTs}::timestamptz
      OR EXISTS (
        SELECT 1 FROM scraper_jobs sj
        WHERE sj.date_from <= ${to}::date
          AND sj.date_to   >= ${from}::date
          AND sj.started_at IS NOT NULL
          AND cn.scraped_at >= sj.started_at
          AND cn.scraped_at <= COALESCE(sj.finished_at, NOW()) + INTERVAL '10 minutes'
      )
    )
    ORDER BY cn.line_user_id, cn.noted_at DESC NULLS LAST
  `;

  // ---- จัดกลุ่มต่อ customer ----
  const customerMap = {};

  // เริ่มจาก messages — ได้ display_name และ picture_url มาด้วยเลย
  for (const m of messages) {
    if (!customerMap[m.line_user_id]) {
      customerMap[m.line_user_id] = {
        line_user_id: m.line_user_id,
        display_name: m.display_name,
        picture_url:  m.picture_url,
        messages: [],
        notes: [],
      };
    }
    customerMap[m.line_user_id].messages.push({
      message_text:        m.message_text,
      created_at:          m.created_at,
      admin_name:          m.admin_name,
      final_score:         m.final_score,
      speed_score:         m.speed_score,
      correctness_score:   m.correctness_score,
      sentiment_score:     m.sentiment_score,
      response_seconds:    m.response_seconds,
      fail_reasons:        m.fail_reasons,
      matched_rules:       m.matched_rules,
      customer_text:       m.customer_text,
      customer_created_at: m.customer_created_at,
    });
  }

  // เพิ่ม notes
  for (const n of notes) {
    if (!customerMap[n.line_user_id]) {
      customerMap[n.line_user_id] = {
        line_user_id: n.line_user_id,
        display_name: null,
        picture_url:  null,
        messages: [],
        notes: [],
      };
    }
    customerMap[n.line_user_id].notes.push(n);
  }

  const result = Object.values(customerMap)
    .sort((a, b) => (a.display_name || a.line_user_id).localeCompare(b.display_name || b.line_user_id));

  return Response.json({
    from, to,
    jobs,
    total_customers: result.length,
    total_messages:  messages.length,
    total_notes:     notes.length,
    customers: result,
  }, { headers: CORS });
}

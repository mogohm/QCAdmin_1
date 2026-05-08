import { query } from "@/lib/db";

function mask(val) {
  if (!val) return "(ไม่มีค่า ❌)";
  const s = String(val);
  if (s.length <= 8) return "****";
  return s.slice(0, 4) + "****" + s.slice(-4) + ` (${s.length} chars ✅)`;
}

function present(val) {
  return val ? `✅ มีค่า (${String(val).length} chars)` : "❌ ไม่มีค่า";
}

export async function GET() {
  const envCheck = {
    DATABASE_URL: present(process.env.DATABASE_URL),
    LINE_CHANNEL_SECRET: mask(process.env.LINE_CHANNEL_SECRET),
    LINE_CHANNEL_ACCESS_TOKEN: mask(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    ADMIN_API_KEY: mask(process.env.ADMIN_API_KEY),
  };

  // Test DB connection + count rows in each table
  let dbStatus = "❌ เชื่อมต่อไม่ได้";
  let tables = {};
  let dbError = null;
  try {
    const counts = await query`
      SELECT
        (SELECT count(*) FROM line_customers)::int    AS line_customers,
        (SELECT count(*) FROM conversations)::int     AS conversations,
        (SELECT count(*) FROM messages)::int          AS messages,
        (SELECT count(*) FROM qc_admins)::int         AS qc_admins,
        (SELECT count(*) FROM qc_scores)::int         AS qc_scores,
        (SELECT count(*) FROM customer_events)::int   AS customer_events
    `;
    tables = counts[0];
    dbStatus = "✅ เชื่อมต่อได้";
  } catch (err) {
    dbError = String(err.message || err);
  }

  // Test LINE token (call profile API with a dummy ID — just check auth)
  let lineTokenStatus = "⏭ ไม่ได้เช็ค (ไม่มี token)";
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      const res = await fetch("https://api.line.me/v2/bot/info", {
        headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
      });
      if (res.ok) {
        const info = await res.json();
        lineTokenStatus = `✅ Token ใช้ได้ — Bot: ${info.displayName || info.basicId || "unknown"}`;
      } else {
        lineTokenStatus = `❌ Token ใช้ไม่ได้ (HTTP ${res.status})`;
      }
    } catch (err) {
      lineTokenStatus = `❌ เรียก LINE API ไม่ได้: ${err.message}`;
    }
  }

  // Recent messages (last 5)
  let recentMessages = [];
  try {
    recentMessages = await query`
      SELECT m.created_at, m.direction, m.message_text,
             lc.display_name, m.line_user_id
      FROM messages m
      LEFT JOIN line_customers lc ON lc.line_user_id = m.line_user_id
      ORDER BY m.created_at DESC
      LIMIT 5
    `;
  } catch (_) {}

  return Response.json({
    status: "running ✅",
    timestamp: new Date().toISOString(),
    env: envCheck,
    database: {
      status: dbStatus,
      error: dbError,
      tables,
    },
    line: {
      token: lineTokenStatus,
    },
    recentMessages,
  });
}

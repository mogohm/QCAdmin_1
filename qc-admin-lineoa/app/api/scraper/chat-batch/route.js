// ============================================================
// POST /api/scraper/chat-batch — เก็บ "ทุกข้อความ" ของแชทก่อน แล้วค่อยจับคู่ QC (ขั้นที่ 2)
// ------------------------------------------------------------
//   หลักการ: collection แยกจาก QC pairing → ลูกค้าที่ยังไม่ได้ตอบ (customer-only) ต้องไม่หาย
//   Auth: x-api-key (scraper service)
//   Body: { scraper_job_id, customer:{line_user_id,customer_name,picture_url},
//           chat:{detected_list_label,latest_activity_date},
//           target:{from,to}, messages:[{direction,message_type,text,created_at,admin_name,message_hash}] }
//   คืน counts ครบ + conversation_id
// ============================================================
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { runQc } from "@/lib/qc-runner";
import { isPkName } from "@/lib/admin-name";
import core from "@/lib/scraper-core";
import { messageInTargetRange } from "@/lib/scraper-date";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const hashOf = (t) => core.hashText(String(t || ""));

export async function POST(req) {
  if (!requireAdmin(req))
    return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const b = await req.json().catch(() => ({}));
  const cust = b.customer || {};
  const lineUserId = cust.line_user_id;
  const jobId = b.scraper_job_id || null;
  const from = b.target?.from || null;
  const to = b.target?.to || from;
  const msgs = Array.isArray(b.messages) ? b.messages : [];
  if (!lineUserId)
    return Response.json({ error: "customer.line_user_id required" }, { status: 400, headers: CORS });

  // กรองเฉพาะข้อความในช่วงวันเป้าหมาย (เวลาไทย) — กัน "วันนี้" รั่ว
  const target = from
    ? msgs.filter((m) => messageInTargetRange(m.created_at, from, to))
    : msgs;

  const counts = {
    messages_found: target.length,
    messages_inserted: 0,
    duplicates_skipped: 0,
    customer_messages: 0,
    admin_messages: 0,
    system_messages: 0,
    qc_pairs_created: 0,
    pending_reply_count: 0,
    flagged: 0,
  };

  try {
    // 1) upsert customer
    await query`INSERT INTO line_customers (line_user_id, display_name, picture_url)
      VALUES (${lineUserId}, ${cust.customer_name || null}, ${cust.picture_url || null})
      ON CONFLICT (line_user_id) DO UPDATE SET
        display_name = COALESCE(EXCLUDED.display_name, line_customers.display_name),
        picture_url  = COALESCE(EXCLUDED.picture_url, line_customers.picture_url)`;

    // 2) upsert conversation (open)
    let conv = await query`SELECT id FROM conversations WHERE line_user_id = ${lineUserId} AND status='open' ORDER BY opened_at DESC LIMIT 1`;
    if (!conv[0])
      conv = await query`INSERT INTO conversations (line_user_id, status, source) VALUES (${lineUserId}, 'open', 'scraper') RETURNING id`;
    const convId = conv[0].id;

    // resolve admin id จากชื่อ (cache ต่อ request) — เฉพาะชื่อ PK จริง
    const adminCache = new Map();
    const resolveAdmin = async (name) => {
      if (!name || !isPkName(name)) return null;
      if (adminCache.has(name)) return adminCache.get(name);
      let id = null;
      const f = await query`SELECT id FROM qc_admins WHERE lower(member_name) LIKE ${"%" + name.toLowerCase() + "%"} AND is_active=true LIMIT 1`;
      if (f[0]) id = f[0].id;
      else {
        const norm = name.toLowerCase().replace(/[^a-z0-9ก-๙]/g, "_").slice(0, 80);
        const c = await query`INSERT INTO qc_admins (member_name, normalized_name, is_active, source) VALUES (${name}, ${norm + "_" + Date.now()}, true, 'scraper') RETURNING id`;
        id = c[0].id;
      }
      adminCache.set(name, id);
      return id;
    };

    // 3) insert ALL target messages (dedup by conversation + message_hash) — เก็บ id ไว้จับคู่
    const idByKey = new Map(); // direction|hash|created_at → message_id
    const keyOf = (dir, text, at) => `${dir}|${hashOf(text)}|${at || ""}`;
    for (const m of target) {
      const dir = m.direction === "admin" ? "admin" : m.direction === "customer" ? "customer" : "system";
      if (dir === "customer") counts.customer_messages++;
      else if (dir === "admin") counts.admin_messages++;
      else counts.system_messages++;
      const hash = m.message_hash || hashOf(m.text);
      const at = m.created_at || null;
      // dedup: มีข้อความนี้ใน conversation แล้วหรือยัง
      const exist = await query`SELECT id FROM messages WHERE conversation_id=${convId} AND direction=${dir} AND message_hash=${hash} AND (${at}::timestamptz IS NULL OR created_at=${at}::timestamptz) LIMIT 1`;
      if (exist[0]) {
        counts.duplicates_skipped++;
        idByKey.set(keyOf(dir, m.text, at), exist[0].id);
        continue;
      }
      const adminId = dir === "admin" ? await resolveAdmin(m.admin_name) : null;
      const row = at
        ? await query`INSERT INTO messages (conversation_id, line_user_id, direction, message_text, message_type, admin_id, admin_name, source, scraper_job_id, message_hash, created_at)
            VALUES (${convId}, ${lineUserId}, ${dir}, ${m.text}, ${m.message_type || "text"}, ${adminId}, ${m.admin_name || null}, 'scraper', ${jobId}, ${hash}, ${at}::timestamptz) RETURNING id`
        : await query`INSERT INTO messages (conversation_id, line_user_id, direction, message_text, message_type, admin_id, admin_name, source, scraper_job_id, message_hash)
            VALUES (${convId}, ${lineUserId}, ${dir}, ${m.text}, ${m.message_type || "text"}, ${adminId}, ${m.admin_name || null}, 'scraper', ${jobId}, ${hash}) RETURNING id`;
      counts.messages_inserted++;
      idByKey.set(keyOf(dir, m.text, at), row[0].id);
    }

    // 4) QC pairing (ขั้นที่ 2) — จับคู่จากข้อความเป้าหมาย แล้ว runQc
    const pairs = core.pairMessages(
      target.map((m) => ({
        direction: m.direction,
        message_text: m.text,
        created_at: m.created_at,
        admin_name: m.admin_name,
        message_type: m.message_type,
      })),
      { groupWindowSec: 180 },
    );
    for (const p of pairs) {
      if (!p.customer_text || !p.admin_text) continue; // ไม่มีคู่จริง → ไม่สร้าง QC
      const adminId = await resolveAdmin(p.admin_name);
      if (!adminId) continue; // ชื่อไม่ใช่ PK จริง → ข้าม (ไม่มั่ว)
      const adminMsgId = idByKey.get(keyOf("admin", p.admin_text.split("\n")[0], p.admin_created_at)) || null;
      const custMsgId = p.customer_created_at
        ? idByKey.get(keyOf("customer", p.customer_text.split("\n").slice(-1)[0], p.customer_created_at)) || null
        : null;
      try {
        const qc = await runQc({
          conversationId: convId,
          customerMessageId: custMsgId,
          adminMessageId: adminMsgId,
          adminId,
          lineUserId,
          customerText: p.customer_text,
          adminText: p.admin_text,
          responseSeconds: p.response_seconds,
          createdAt: p.admin_created_at,
          adminName: p.admin_name,
          customerName: cust.customer_name,
          scraperJobId: jobId,
        });
        counts.qc_pairs_created++;
        if (qc && (Number(qc.finalScore) < 70 || qc.isFatal || (qc.minorIssues || []).length)) counts.flagged++;
      } catch (e) {
        console.error("chat-batch runQc:", e.message);
      }
    }

    // 5) pending_reply — ลูกค้าที่ยังไม่ได้ตอบ (ข้อความลูกค้าหลัง admin คนสุดท้าย)
    const sorted = [...target].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    let lastAdminIdx = -1;
    sorted.forEach((m, i) => { if (m.direction === "admin") lastAdminIdx = i; });
    const pendingCust = sorted.filter((m, i) => m.direction === "customer" && i > lastAdminIdx);
    counts.pending_reply_count = pendingCust.length;
    for (const pm of pendingCust) {
      const id = idByKey.get(keyOf("customer", pm.text, pm.created_at));
      if (id) await query`UPDATE messages SET pending_reply=true WHERE id=${id}`.catch(() => {});
    }

    // 6) conversation meta + scraper_chat_results
    await query`UPDATE conversations SET last_scraped_at=now(), last_scraper_job_id=${jobId}, source=COALESCE(source,'scraper') WHERE id=${convId}`.catch(() => {});
    await query`INSERT INTO scraper_chat_results (scraper_job_id, conversation_id, line_user_id, target_date_from, target_date_to,
        messages_found, messages_inserted, customer_messages, admin_messages, system_messages, qc_pairs_created, pending_reply_count, duplicates_skipped, status)
      VALUES (${jobId}, ${convId}, ${lineUserId}, ${from}::date, ${to}::date,
        ${counts.messages_found}, ${counts.messages_inserted}, ${counts.customer_messages}, ${counts.admin_messages},
        ${counts.system_messages}, ${counts.qc_pairs_created}, ${counts.pending_reply_count}, ${counts.duplicates_skipped},
        ${counts.messages_found ? "ok" : "empty"})`.catch((e) => console.error("chat_results:", e.message));

    return Response.json({ ok: true, conversation_id: convId, messages_received: msgs.length, ...counts }, { headers: CORS });
  } catch (e) {
    return Response.json({ error: e.message, ...counts }, { status: 500, headers: CORS });
  }
}

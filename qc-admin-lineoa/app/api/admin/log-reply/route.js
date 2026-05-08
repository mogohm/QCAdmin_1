import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { scoreReply } from '@/lib/qc-engine';
import { sendTelegram } from '@/lib/telegram';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// เรียกจาก Browser Extension — รับ line_user_id แทน conversation_id
// send_line = false เสมอ (ส่งไปแล้วจาก LINE OA Manager)
export async function POST(req) {
  if (!requireAdmin(req)) return Response.json({ error: 'unauthorized' }, { status: 401, headers: CORS });

  const { line_user_id, admin_id, admin_name, text, customer_text, admin_ts, customer_ts } = await req.json();
  if (!line_user_id || !text)
    return Response.json({ error: 'line_user_id, text required' }, { status: 400, headers: CORS });

  // ถ้าไม่มี admin_id ให้หาจากชื่อที่ scraper ดึงมา หรือสร้างใหม่อัตโนมัติ
  let resolvedAdminId = admin_id;
  if (!resolvedAdminId && admin_name) {
    const found = await query`
      SELECT id FROM qc_admins
      WHERE lower(member_name) LIKE ${'%' + admin_name.toLowerCase() + '%'} AND is_active = true
      LIMIT 1
    `;
    if (found[0]) {
      resolvedAdminId = found[0].id;
    } else {
      // สร้าง admin ใหม่อัตโนมัติจากชื่อที่ scraper ดึงมา
      const norm = admin_name.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '_').slice(0, 80);
      const created = await query`
        INSERT INTO qc_admins (member_name, normalized_name, is_active, source)
        VALUES (${admin_name}, ${norm + '_' + Date.now()}, true, 'scraper')
        RETURNING id
      `;
      resolvedAdminId = created[0].id;
    }
  }
  if (!resolvedAdminId)
    return Response.json({ error: 'ระบุ admin_id หรือ admin_name' }, { status: 400, headers: CORS });

  // ป้องกัน duplicate — ข้อความเดียวกัน admin คนเดียว ภายใน 7 วัน
  const dup = await query`
    SELECT m.id, m.conversation_id FROM messages m
    WHERE m.line_user_id = ${line_user_id}
      AND m.admin_id     = ${resolvedAdminId}
      AND m.message_text = ${text}
      AND m.direction    = 'admin'
      AND m.created_at   > now() - interval '7 days'
    LIMIT 1
  `;
  if (dup[0]) {
    // ถ้ามี customer_text ส่งมาใหม่ ให้เพิ่มเข้า conversation เดิมที่ยังไม่มี
    if (customer_text) {
      const existCust = await query`
        SELECT id FROM messages
        WHERE conversation_id = ${dup[0].conversation_id}
          AND direction = 'customer' AND message_text = ${customer_text}
        LIMIT 1
      `;
      if (!existCust[0]) {
        await query`
          INSERT INTO messages (conversation_id, line_user_id, direction, message_text)
          VALUES (${dup[0].conversation_id}, ${line_user_id}, 'customer', ${customer_text})
        `;
      }
    }
    return Response.json({ ok: true, duplicate: true }, { headers: CORS });
  }

  // ตรวจสอบ/สร้าง customer ก่อน (FK constraint)
  await query`
    INSERT INTO line_customers (line_user_id, display_name)
    VALUES (${line_user_id}, ${line_user_id})
    ON CONFLICT (line_user_id) DO NOTHING
  `;

  // หา open conversation ของ user นี้
  let conv = await query`
    SELECT id FROM conversations
    WHERE line_user_id = ${line_user_id} AND status = 'open'
    ORDER BY opened_at DESC LIMIT 1
  `;

  // ถ้าไม่มี open conv ให้สร้างใหม่ (เผื่อกรณีแอดมินเปิดการสนทนาก่อน)
  if (!conv[0]) {
    const newConv = await query`
      INSERT INTO conversations (line_user_id, status)
      VALUES (${line_user_id}, 'open')
      RETURNING id
    `;
    conv = newConv;
  }

  const convId = conv[0].id;

  // บันทึกข้อความลูกค้าที่ scraper ส่งมา พร้อม timestamp จริงจาก LINE
  if (customer_text) {
    const existCust = await query`
      SELECT id FROM messages
      WHERE conversation_id = ${convId} AND direction = 'customer' AND message_text = ${customer_text}
      LIMIT 1
    `;
    if (!existCust[0]) {
      const custAt = customer_ts || null;
      if (custAt) {
        await query`
          INSERT INTO messages (conversation_id, line_user_id, direction, message_text, created_at)
          VALUES (${convId}, ${line_user_id}, 'customer', ${customer_text}, ${custAt}::timestamptz)
        `;
      } else {
        await query`
          INSERT INTO messages (conversation_id, line_user_id, direction, message_text)
          VALUES (${convId}, ${line_user_id}, 'customer', ${customer_text})
        `;
      }
    } else if (customer_ts) {
      // แก้ timestamp ที่อาจเคย insert ด้วย now() — ให้ LATERAL join หาเจอ
      await query`UPDATE messages SET created_at = ${customer_ts}::timestamptz WHERE id = ${existCust[0].id}`;
    }
  }

  // ดึงข้อความลูกค้าล่าสุด (สำหรับคำนวณ response time)
  const lastCustomer = await query`
    SELECT * FROM messages
    WHERE conversation_id = ${convId} AND direction = 'customer'
    ORDER BY created_at DESC LIMIT 1
  `;

  // บันทึก admin message พร้อม timestamp จริงจาก LINE
  const adminAt = admin_ts || null;
  const adminMsg = adminAt ? await query`
    INSERT INTO messages (conversation_id, line_user_id, admin_id, direction, message_text, created_at)
    VALUES (${convId}, ${line_user_id}, ${resolvedAdminId}, 'admin', ${text}, ${adminAt}::timestamptz)
    RETURNING *
  ` : await query`
    INSERT INTO messages (conversation_id, line_user_id, admin_id, direction, message_text)
    VALUES (${convId}, ${line_user_id}, ${resolvedAdminId}, 'admin', ${text})
    RETURNING *
  `;

  await query`
    UPDATE conversations SET assigned_admin_id = ${resolvedAdminId} WHERE id = ${convId}
  `;

  // คำนวณ QC score
  const settings = await query`SELECT value FROM app_settings WHERE key = 'response_limit_minutes'`;
  const rules = await query`SELECT rule_code, rule_name, category, question_keywords, answer_keywords FROM knowledge_rules WHERE is_active = true`;

  let responseSeconds = null;
  let customerMsgId = null;
  if (lastCustomer[0]) {
    const diff = await query`
      SELECT EXTRACT(EPOCH FROM (${adminMsg[0].created_at}::timestamptz - ${lastCustomer[0].created_at}::timestamptz))::int AS sec
    `;
    responseSeconds = diff[0].sec;
    customerMsgId = lastCustomer[0].id;
  }

  const qc = scoreReply({
    customerText: lastCustomer[0]?.message_text || '',
    adminText: text,
    responseSeconds: responseSeconds ?? 0,
    responseLimitMinutes: settings[0]?.value || process.env.QC_RESPONSE_LIMIT_MINUTES || 5,
    rules,
  });

  const scoreRow = await query`
    INSERT INTO qc_scores (
      conversation_id, customer_message_id, admin_message_id, admin_id,
      response_seconds, speed_score, correctness_score, sentiment_score,
      final_score, fail_reasons, matched_rules, created_at
    ) VALUES (
      ${convId}, ${customerMsgId}, ${adminMsg[0].id}, ${resolvedAdminId},
      ${responseSeconds}, ${qc.speedScore}, ${qc.correctnessScore}, ${qc.sentimentScore},
      ${qc.finalScore}, ${JSON.stringify(qc.failReasons)}, ${JSON.stringify(qc.matchedRules)},
      ${adminMsg[0].created_at}
    ) RETURNING *
  `;
  qc.id = scoreRow[0].id;

  if (qc.finalScore < 70 || qc.failReasons.length)
    await sendTelegram(`QC FAIL: score ${qc.finalScore}\n${qc.failReasons.join(', ')}\nAdmin: ${admin_name || admin_id}`).catch(() => {});

  // ---- Auto-detect customer events ----
  const allText = [text, customer_text || ''].join(' ');

  // สมัครผ่าน: ค้นหาเบอร์โทร/เลขบัญชีในข้อความ admin + customer 5 ล่าสุดของ conversation
  // (scraper ส่งแค่ข้อความก่อนหน้า 1 ข้อความ ข้อมูลสมัครอาจอยู่ในข้อความก่อนหน้านั้น)
  const recentCust = await query`
    SELECT message_text FROM messages
    WHERE conversation_id = ${convId} AND direction = 'customer'
    ORDER BY created_at DESC LIMIT 5
  `;
  const regSearchText = [text, ...recentCust.map(r => r.message_text)].join(' ').replace(/[\s\-.()]/g, '');
  const hasPhone   = /0[689]\d{8}/.test(regSearchText);
  const hasBankAcc = /\b\d{10,12}\b/.test(regSearchText);
  if (hasPhone || hasBankAcc) {
    const existReg = await query`
      SELECT id FROM customer_events
      WHERE line_user_id = ${line_user_id} AND event_type = 'register'
      LIMIT 1
    `;
    if (!existReg[0]) {
      await query`
        INSERT INTO customer_events (line_user_id, event_type, status, metadata)
        VALUES (${line_user_id}, 'register', 'pass', ${JSON.stringify({
          admin_id: resolvedAdminId, admin_name: admin_name || null,
          detected: hasPhone ? 'phone' : 'bank_account',
        })})
      `;
    }
  }

  // ยอดเติม: ลูกค้าแจ้งยอดเงินในข้อความ
  if (customer_text) {
    const depositRe = /(?:โอน|ฝาก|เติม|deposit)[^\d]{0,10}(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)|(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:บาท|฿)/gi;
    const matches = [...customer_text.matchAll(depositRe)];
    for (const m of matches) {
      const raw = (m[1] || m[2] || '').replace(/,/g, '');
      const amount = parseFloat(raw);
      if (amount >= 1 && amount <= 10000000) {
        await query`
          INSERT INTO customer_events (line_user_id, event_type, amount, metadata)
          VALUES (${line_user_id}, 'deposit', ${amount}, ${JSON.stringify({
            admin_id: resolvedAdminId, admin_name: admin_name || null,
            detected_text: customer_text.slice(0, 200),
          })})
        `;
        break; // บันทึกแค่ครั้งเดียวต่อ message
      }
    }
  }

  return Response.json({ ok: true, qc }, { headers: CORS });
}

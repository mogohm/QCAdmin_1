// log-reply route — POST จาก scraper: upsert customer/conversation, insert messages,
//   runQc → qc_scores + qc_score_details, dedup. (full source ~330 lines)
import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";
import { isPkName } from "@/lib/admin-name";
import { runQc } from "@/lib/qc-runner";
import { getLineProfile } from "@/lib/line";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// เรียกจาก Browser Extension — รับ line_user_id แทน conversation_id
// send_line = false เสมอ (ส่งไปแล้วจาก LINE OA Manager)
export async function POST(req) {
  // scraper service ใช้ x-api-key (guard bypass); session ต้องมี chat.reply
  const gate = guard(req, "chat.reply");
  if (gate)
    return Response.json(
      { error: "unauthorized" },
      { status: gate.status, headers: CORS },
    );

  const {
    line_user_id,
    admin_id,
    admin_name,
    text,
    customer_text,
    admin_ts,
    customer_ts,
    customer_name,
    assigned_admin,
    phone,
    email,
    message_type,
    reply_group_id,
    source,
    scraper_job_id,
  } = await req.json();
  if (!line_user_id || !text)
    return Response.json(
      { error: "line_user_id, text required" },
      { status: 400, headers: CORS },
    );

  // ถ้าไม่มี admin_id ให้หาจากชื่อที่ scraper ดึงมา หรือสร้างใหม่อัตโนมัติ
  // กฎ: admin จริงทุกคนขึ้นต้นด้วย "PK" (รองรับฟอนต์ Unicode แปลก) — ไม่ใช่ = scraper ดึงผิด → ไม่บันทึก
  let resolvedAdminId = admin_id;
  if (!resolvedAdminId && admin_name) {
    if (!isPkName(admin_name)) {
      // ชื่อไม่ใช่ admin จริง (เช่น Download, ชื่อลูกค้า, badge) — ข้าม ไม่บันทึกกันข้อมูลมั่ว
      return Response.json(
        { ok: true, skipped: "non-PK admin name", admin_name },
        { headers: CORS },
      );
    }
    const found = await query`
      SELECT id FROM qc_admins
      WHERE lower(member_name) LIKE ${"%" + admin_name.toLowerCase() + "%"} AND is_active = true
      LIMIT 1
    `;
    if (found[0]) {
      resolvedAdminId = found[0].id;
    } else {
      const norm = admin_name
        .toLowerCase()
        .replace(/[^a-z0-9ก-๙]/g, "_")
        .slice(0, 80);
      const created = await query`
        INSERT INTO qc_admins (member_name, normalized_name, is_active, source)
        VALUES (${admin_name}, ${norm + "_" + Date.now()}, true, 'scraper')
        RETURNING id
      `;
      resolvedAdminId = created[0].id;
    }
  }
  if (!resolvedAdminId)
    return Response.json(
      { error: "ระบุ admin_id หรือ admin_name" },
      { status: 400, headers: CORS },
    );

  // ตรวจสอบ/สร้าง customer ก่อน (FK constraint)
  // ถ้ามี customer_name จาก scraper (ชื่อที่เห็นใน LINE OA) ให้อัปเดตด้วย
  await query`
    INSERT INTO line_customers (line_user_id, display_name, assigned_admin, phone, email)
    VALUES (${line_user_id}, ${customer_name || null}, ${assigned_admin || null}, ${phone || null}, ${email || null})
    ON CONFLICT (line_user_id)
    DO UPDATE SET
      display_name   = COALESCE(EXCLUDED.display_name,   line_customers.display_name),
      assigned_admin = COALESCE(EXCLUDED.assigned_admin, line_customers.assigned_admin),
      phone          = COALESCE(EXCLUDED.phone,          line_customers.phone),
      email          = COALESCE(EXCLUDED.email,          line_customers.email)
  `;
  // ดึงชื่อจาก LINE API (fire-and-forget) — override เฉพาะถ้า display_name ยังเป็น null
  getLineProfile(line_user_id)
    .then((profile) => {
      if (profile?.displayName) {
        return query`
        UPDATE line_customers
        SET display_name = ${profile.displayName},
            picture_url  = COALESCE(${profile.pictureUrl || null}, picture_url)
        WHERE line_user_id = ${line_user_id}
          AND display_name IS NULL
      `;
      }
    })
    .catch(() => {});

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
        if (customer_ts) {
          await query`
            INSERT INTO messages (conversation_id, line_user_id, direction, message_text, created_at)
            VALUES (${dup[0].conversation_id}, ${line_user_id}, 'customer', ${customer_text}, ${customer_ts}::timestamptz)
          `;
        } else {
          await query`
            INSERT INTO messages (conversation_id, line_user_id, direction, message_text)
            VALUES (${dup[0].conversation_id}, ${line_user_id}, 'customer', ${customer_text})
          `;
        }
      }
    }
    return Response.json(
      {
        ok: true,
        duplicate: true,
        inserted_messages: 0,
        skipped_duplicates: 1,
        qc_score_id: null,
      },
      { headers: CORS },
    );
  }

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
  let insertedMessages = 0; // นับข้อความที่ insert จริง (customer + admin)

  // บันทึกข้อความลูกค้าที่ scraper ส่งมา — จับ id ไว้ตรงนี้เลย
  // (ไม่ query ใหม่ทีหลัง เพราะ ORDER BY created_at อาจคืน message อื่นในกลุ่มเดียวกัน)
  let customerMsgId = null;
  let customerMsgText = null;
  let customerMsgCreatedAt = null;

  if (customer_text) {
    const existCust = await query`
      SELECT id, created_at FROM messages
      WHERE conversation_id = ${convId} AND direction = 'customer' AND message_text = ${customer_text}
      LIMIT 1
    `;
    if (!existCust[0]) {
      const custAt = customer_ts || null;
      const custRow = custAt
        ? await query`
        INSERT INTO messages (conversation_id, line_user_id, direction, message_text, created_at)
        VALUES (${convId}, ${line_user_id}, 'customer', ${customer_text}, ${custAt}::timestamptz)
        RETURNING id, created_at
      `
        : await query`
        INSERT INTO messages (conversation_id, line_user_id, direction, message_text)
        VALUES (${convId}, ${line_user_id}, 'customer', ${customer_text})
        RETURNING id, created_at
      `;
      customerMsgId = custRow[0].id;
      customerMsgCreatedAt = custRow[0].created_at;
      insertedMessages++;
    } else {
      customerMsgId = existCust[0].id;
      customerMsgCreatedAt = existCust[0].created_at;
      if (customer_ts) {
        await query`UPDATE messages SET created_at = ${customer_ts}::timestamptz WHERE id = ${existCust[0].id}`;
        customerMsgCreatedAt = customer_ts;
      }
    }
    customerMsgText = customer_text;
  } else {
    // ไม่มี customer_text จาก scraper — fallback หาจาก conversation
    const fallback = await query`
      SELECT id, created_at, message_text FROM messages
      WHERE conversation_id = ${convId} AND direction = 'customer'
      ORDER BY created_at DESC LIMIT 1
    `;
    if (fallback[0]) {
      customerMsgId = fallback[0].id;
      customerMsgCreatedAt = fallback[0].created_at;
      customerMsgText = fallback[0].message_text;
    }
  }

  // บันทึก admin message พร้อม timestamp จริงจาก LINE
  const adminAt = admin_ts || null;
  const msgType = message_type || "text";
  const src = source || "scraper";
  const adminMsg = adminAt
    ? await query`
    INSERT INTO messages (conversation_id, line_user_id, admin_id, direction, message_text, message_type, source, admin_name, reply_group_id, created_at)
    VALUES (${convId}, ${line_user_id}, ${resolvedAdminId}, 'admin', ${text}, ${msgType}, ${src}, ${admin_name || null}, ${reply_group_id || null}, ${adminAt}::timestamptz)
    RETURNING *
  `
    : await query`
    INSERT INTO messages (conversation_id, line_user_id, admin_id, direction, message_text, message_type, source, admin_name, reply_group_id)
    VALUES (${convId}, ${line_user_id}, ${resolvedAdminId}, 'admin', ${text}, ${msgType}, ${src}, ${admin_name || null}, ${reply_group_id || null})
    RETURNING *
  `;
  insertedMessages++;

  await query`
    UPDATE conversations SET assigned_admin_id = ${resolvedAdminId} WHERE id = ${convId}
  `;

  // คำนวณ QC score ผ่าน qc-runner (SOP + fatal + SLA + details + telegram)
  const settings =
    await query`SELECT value FROM app_settings WHERE key = 'response_limit_minutes'`;

  let responseSeconds = null;
  if (customerMsgCreatedAt) {
    const diff = await query`
      SELECT EXTRACT(EPOCH FROM (${adminMsg[0].created_at}::timestamptz - ${customerMsgCreatedAt}::timestamptz))::int AS sec
    `;
    responseSeconds = diff[0].sec;
  }

  const qc = await runQc({
    conversationId: convId,
    customerMessageId: customerMsgId,
    adminMessageId: adminMsg[0].id,
    adminId: resolvedAdminId,
    lineUserId: line_user_id,
    customerText: customerMsgText || "",
    adminText: text,
    responseSeconds,
    createdAt: adminMsg[0].created_at,
    adminName: admin_name,
    customerName: customer_name,
    responseLimitMinutes:
      settings[0]?.value || process.env.QC_RESPONSE_LIMIT_MINUTES || 5,
  });

  // บันทึก source/scraper_job_id ลง qc_scores (แยกจาก runQc เพื่อไม่แตะ pipeline หลัก)
  if (qc?.id) {
    await query`UPDATE qc_scores SET source = ${src}, scraper_job_id = ${scraper_job_id || null} WHERE id = ${qc.id}`.catch(
      () => {},
    );
  }

  // ---- Auto-detect customer events ----
  const allText = [text, customer_text || ""].join(" ");

  // สมัครผ่าน: ค้นหาเบอร์โทร/เลขบัญชีในข้อความ admin + customer 5 ล่าสุดของ conversation
  // (scraper ส่งแค่ข้อความก่อนหน้า 1 ข้อความ ข้อมูลสมัครอาจอยู่ในข้อความก่อนหน้านั้น)
  const recentCust = await query`
    SELECT message_text FROM messages
    WHERE conversation_id = ${convId} AND direction = 'customer'
    ORDER BY created_at DESC LIMIT 5
  `;
  const regSearchText = [text, ...recentCust.map((r) => r.message_text)]
    .join(" ")
    .replace(/[\s\-.()]/g, "");
  const hasPhone = /0[689]\d{8}/.test(regSearchText);
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
          admin_id: resolvedAdminId,
          admin_name: admin_name || null,
          detected: hasPhone ? "phone" : "bank_account",
        })})
      `;
    }
  }

  // ยอดเติม: ลูกค้าแจ้งยอดเงินในข้อความ
  if (customer_text) {
    const depositRe =
      /(?:โอน|ฝาก|เติม|deposit)[^\d]{0,10}(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)|(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:บาท|฿)/gi;
    const matches = [...customer_text.matchAll(depositRe)];
    for (const m of matches) {
      const raw = (m[1] || m[2] || "").replace(/,/g, "");
      const amount = parseFloat(raw);
      if (amount >= 1 && amount <= 10000000) {
        await query`
          INSERT INTO customer_events (line_user_id, event_type, amount, metadata)
          VALUES (${line_user_id}, 'deposit', ${amount}, ${JSON.stringify({
            admin_id: resolvedAdminId,
            admin_name: admin_name || null,
            detected_text: customer_text.slice(0, 200),
          })})
        `;
        break; // บันทึกแค่ครั้งเดียวต่อ message
      }
    }
  }

  return Response.json(
    {
      ok: true,
      inserted_messages: insertedMessages,
      skipped_duplicates: 0,
      qc_score_id: qc?.id || null,
      conversation_id: convId,
      final_score: qc?.finalScore ?? null,
      matched_sop: qc?.matchedSop?.topic || null,
      response_seconds: responseSeconds,
      qc,
    },
    { headers: CORS },
  );
}
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

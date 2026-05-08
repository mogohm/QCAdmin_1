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

  const { line_user_id, admin_id, admin_name, text } = await req.json();
  if (!line_user_id || !text)
    return Response.json({ error: 'line_user_id, text required' }, { status: 400, headers: CORS });

  // ถ้าไม่มี admin_id ให้หาจากชื่อที่ scraper ดึงมา
  let resolvedAdminId = admin_id;
  if (!resolvedAdminId && admin_name) {
    const found = await query`
      SELECT id FROM qc_admins
      WHERE lower(member_name) LIKE ${'%' + admin_name.toLowerCase() + '%'} AND is_active = true
      LIMIT 1
    `;
    resolvedAdminId = found[0]?.id || null;
  }
  if (!resolvedAdminId)
    return Response.json({ error: 'ระบุ admin_id หรือ admin_name ที่ตรงกับในระบบ' }, { status: 400, headers: CORS });

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

  // ดึงข้อความลูกค้าล่าสุด (สำหรับคำนวณ response time)
  const lastCustomer = await query`
    SELECT * FROM messages
    WHERE conversation_id = ${convId} AND direction = 'customer'
    ORDER BY created_at DESC LIMIT 1
  `;

  // บันทึก admin message (ไม่ส่งผ่าน LINE อีกรอบ)
  const adminMsg = await query`
    INSERT INTO messages (conversation_id, line_user_id, admin_id, direction, message_text)
    VALUES (${convId}, ${line_user_id}, ${resolvedAdminId}, 'admin', ${text})
    RETURNING *
  `;

  await query`
    UPDATE conversations SET assigned_admin_id = ${resolvedAdminId} WHERE id = ${convId}
  `;

  // คำนวณ QC score
  let qc = null;
  if (lastCustomer[0]) {
    const settings = await query`SELECT value FROM app_settings WHERE key = 'response_limit_minutes'`;
    const rules = await query`SELECT rule_code, rule_name, category, question_keywords, answer_keywords FROM knowledge_rules WHERE is_active = true`;
    const diff = await query`
      SELECT EXTRACT(EPOCH FROM (${adminMsg[0].created_at}::timestamptz - ${lastCustomer[0].created_at}::timestamptz))::int AS sec
    `;

    qc = scoreReply({
      customerText: lastCustomer[0].message_text,
      adminText: text,
      responseSeconds: diff[0].sec,
      responseLimitMinutes: settings[0]?.value || process.env.QC_RESPONSE_LIMIT_MINUTES || 5,
      rules,
    });

    const scoreRow = await query`
      INSERT INTO qc_scores (
        conversation_id, customer_message_id, admin_message_id, admin_id,
        response_seconds, speed_score, correctness_score, sentiment_score,
        final_score, fail_reasons, matched_rules
      ) VALUES (
        ${convId}, ${lastCustomer[0].id}, ${adminMsg[0].id}, ${resolvedAdminId},
        ${diff[0].sec}, ${qc.speedScore}, ${qc.correctnessScore}, ${qc.sentimentScore},
        ${qc.finalScore}, ${JSON.stringify(qc.failReasons)}, ${JSON.stringify(qc.matchedRules)}
      ) RETURNING *
    `;
    qc.id = scoreRow[0].id;

    if (qc.finalScore < 70 || qc.failReasons.length)
      await sendTelegram(`QC FAIL: score ${qc.finalScore}\n${qc.failReasons.join(', ')}\nAdmin: ${admin_id}`).catch(() => {});
  }

  return Response.json({ ok: true, qc }, { headers: CORS });
}

// POST /api/manual-case — เพิ่มเคสด้วยตนเอง (คนกรอกเอง) → ให้ QC engine ให้คะแนน
//   ต้องมีสิทธิ์ qc.score.override หรือ qc.monitor.view
//   flow: upsert customer → conversation → insert messages(source='manual') → runQc → evidence
import { query } from "@/lib/db";
import { guard, getCurrentUser } from "@/lib/permissions";
import { runQc } from "@/lib/qc-runner";
import { saveEvidence } from "@/lib/qc-review";

export async function POST(req) {
  const gate = guard(req, "qc.score.override", "qc.monitor.view");
  if (gate) return gate;
  const me = getCurrentUser(req);
  const b = await req.json().catch(() => ({}));
  if (!b.admin_text || !b.customer_text)
    return Response.json(
      { error: "customer_text, admin_text required" },
      { status: 400 },
    );

  try {
    // 1) resolve admin (จากชื่อ หรือ id)
    let adminId = b.admin_id || null;
    if (!adminId && b.admin_name) {
      const found =
        await query`SELECT id FROM qc_admins WHERE lower(member_name) LIKE ${"%" + b.admin_name.toLowerCase() + "%"} AND is_active = true LIMIT 1`;
      if (found[0]) adminId = found[0].id;
      else {
        const norm = b.admin_name
          .toLowerCase()
          .replace(/[^a-z0-9ก-๙]/g, "_")
          .slice(0, 60);
        const cr =
          await query`INSERT INTO qc_admins (member_name, normalized_name, is_active, source)
          VALUES (${b.admin_name}, ${norm + "_" + Date.now()}, true, 'manual') RETURNING id`;
        adminId = cr[0].id;
      }
    }
    if (!adminId)
      return Response.json(
        { error: "ระบุ admin_name หรือ admin_id" },
        { status: 400 },
      );

    // 2) upsert customer (line_user_id อาจไม่มี → สร้าง key จาก manual)
    const lineUserId = b.line_user_id || "manual_" + Date.now();
    await query`INSERT INTO line_customers (line_user_id, display_name)
      VALUES (${lineUserId}, ${b.customer_name || null})
      ON CONFLICT (line_user_id) DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, line_customers.display_name)`;

    // 3) conversation
    const conv =
      await query`INSERT INTO conversations (line_user_id, status) VALUES (${lineUserId}, 'open') RETURNING id`;
    const convId = conv[0].id;

    // 4) messages (source='manual')
    const custAt = b.customer_created_at || null;
    const admAt = b.admin_created_at || null;
    const cm = custAt
      ? await query`INSERT INTO messages (conversation_id, line_user_id, direction, message_text, source, created_at)
          VALUES (${convId}, ${lineUserId}, 'customer', ${b.customer_text}, 'manual', ${custAt}::timestamptz) RETURNING id, created_at`
      : await query`INSERT INTO messages (conversation_id, line_user_id, direction, message_text, source)
          VALUES (${convId}, ${lineUserId}, 'customer', ${b.customer_text}, 'manual') RETURNING id, created_at`;
    const am = admAt
      ? await query`INSERT INTO messages (conversation_id, line_user_id, direction, message_text, admin_id, source, created_at)
          VALUES (${convId}, ${lineUserId}, 'admin', ${b.admin_text}, ${adminId}, 'manual', ${admAt}::timestamptz) RETURNING id, created_at`
      : await query`INSERT INTO messages (conversation_id, line_user_id, direction, message_text, admin_id, source)
          VALUES (${convId}, ${lineUserId}, 'admin', ${b.admin_text}, ${adminId}, 'manual') RETURNING id, created_at`;

    // 5) response time
    let responseSeconds =
      b.response_seconds != null ? Number(b.response_seconds) : null;
    if (responseSeconds == null && custAt && admAt)
      responseSeconds = Math.max(
        0,
        Math.round((new Date(admAt) - new Date(custAt)) / 1000),
      );

    // 6) runQc
    const qc = await runQc({
      conversationId: convId,
      customerMessageId: cm[0].id,
      adminMessageId: am[0].id,
      adminId,
      lineUserId,
      customerText: b.customer_text,
      adminText: b.admin_text,
      responseSeconds,
      createdAt: am[0].created_at,
      adminName: b.admin_name || null,
      customerName: b.customer_name || null,
    });

    // 7) evidence จากผู้กรอก (note/screenshot)
    const ev = [];
    if (b.evidence_note)
      ev.push({
        evidence_type: "system",
        title: "หมายเหตุหลักฐาน",
        data: { note: b.evidence_note },
      });
    if (b.screenshot_path)
      ev.push({
        evidence_type: "screenshot",
        title: "ภาพหน้าจอ (manual)",
        file_path: b.screenshot_path,
      });
    ev.push({
      evidence_type: "system",
      title: "Manual case",
      data: { created_by: me?.name || "manual", reason: b.reason || null },
    });
    await saveEvidence(ev, { qcScoreId: qc.id, conversationId: convId });

    return Response.json({
      ok: true,
      qc_score_id: qc.id,
      final_score: qc.finalScore,
      conversation_id: convId,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/ai-review/:id — หัวหน้าตรวจเคส AI: อนุมัติ/แก้ intent/แก้ SOP/ไม่เกี่ยว QC
//   body: { action: 'approve'|'correct'|'not_relevant', corrected_intent?, corrected_sop_id?, reviewer_note? }
import { query } from "@/lib/db";
import { guard, getCurrentUser } from "@/lib/permissions";
import { validateEntityId, parseNumericId } from "@/lib/db-id";

// GET /api/ai-review/:id — รายละเอียดเคสเต็ม (บทสนทนา/การวิเคราะห์/หลักฐาน/ประวัติ)
//   เชื่อมโยงด้วย id → qc_score_id → conversation_id → message ids (ไม่พึ่งชื่อ/เดาวันที่)
export async function GET(req, { params }) {
  const gate = guard(req, "qc.dispute.review", "qc.score.override");
  if (gate) return gate;
  const { id } = await params;
  const v = validateEntityId(id, "uuid");
  if (!v.ok)
    return Response.json({ error: "รหัสเคสไม่ถูกต้อง" }, { status: 400 });
  try {
    const rows = await query`
      SELECT r.*, s.topic AS matched_sop_topic, s.answer AS matched_sop_answer
      FROM ai_review_queue r
      LEFT JOIN sop_scripts s ON s.id = r.matched_sop_id
      WHERE r.id = ${v.value}::uuid`;
    const item = rows[0];
    if (!item)
      return Response.json({ error: "ไม่พบเคสนี้ในระบบ" }, { status: 404 });

    // Tab 1: บทสนทนา — timeline จริงจาก conversation (highlight คู่ข้อความด้วย message ids)
    const timeline = item.conversation_id
      ? await query`SELECT id, direction, message_text, message_type, admin_name, created_at
          FROM messages WHERE conversation_id = ${item.conversation_id}
          ORDER BY created_at ASC LIMIT 200`.catch(() => [])
      : [];

    // Tab 2: การวิเคราะห์ AI — คะแนน + รายมิติ
    const score = item.qc_score_id
      ? (await query`SELECT * FROM qc_scores WHERE id = ${item.qc_score_id}`.catch(() => []))[0] || null
      : null;
    const details = item.qc_score_id
      ? await query`SELECT category_code, raw_score, weighted_score, max_score, pass, fail_reason, suggestion
          FROM qc_score_details WHERE qc_score_id = ${item.qc_score_id} ORDER BY category_code`.catch(() => [])
      : [];

    // Tab 3: หลักฐาน — รายการแบบเบา (ภาพจริงเปิดผ่าน EvidenceViewer/case-evidence)
    const evidence = await query`
      SELECT id, evidence_type, title, file_path, url, created_at,
             (data->>'dataUrl' IS NOT NULL OR url IS NOT NULL OR file_path IS NOT NULL) AS has_file
      FROM case_evidence
      WHERE (${item.qc_score_id}::uuid IS NOT NULL AND qc_score_id = ${item.qc_score_id}::uuid)
         OR (${item.conversation_id}::uuid IS NOT NULL AND conversation_id = ${item.conversation_id}::uuid)
      ORDER BY created_at DESC LIMIT 50`.catch(() => []);

    // Tab 4: ประวัติการตรวจ — จากแถวเอง + log การซ่อมข้อมูล (ถ้ามี)
    const history = [];
    history.push({
      action: "สร้างเคสเข้าคิว",
      by: item.source || "system",
      at: item.created_at,
      note: item.reason,
    });
    if (item.reviewed_at)
      history.push({
        action: item.review_action || item.status,
        by: item.reviewed_by || "-",
        at: item.reviewed_at,
        note: item.reviewer_note || null,
      });
    const repairs = await query`SELECT field, old_value, new_value, reason, created_at
      FROM data_repair_logs WHERE table_name='ai_review_queue' AND row_id=${String(item.id)}
      ORDER BY created_at`.catch(() => []);
    for (const rp of repairs)
      history.push({
        action: `ซ่อมข้อมูล (${rp.field})`,
        by: "system",
        at: rp.created_at,
        note: `"${(rp.old_value || "").slice(0, 60)}" → "${rp.new_value || "ไม่ทราบชื่อลูกค้า"}"`,
      });
    history.sort((a, b) => new Date(a.at) - new Date(b.at));

    return Response.json({ ok: true, item, timeline, analysis: { score, details }, evidence, history });
  } catch (e) {
    console.error("[ai-review GET detail]", e.message);
    return Response.json(
      { error: "ไม่สามารถโหลดรายละเอียดเคสได้ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}

export async function PATCH(req, { params }) {
  const gate = guard(req, "qc.dispute.review", "qc.score.override");
  if (gate) return gate;
  const me = getCurrentUser(req);
  const { id } = await params;
  // ai_review_queue.id เป็น UUID — validate ก่อน query กัน raw SQL error (เช่น id="23")
  const v = validateEntityId(id, "uuid");
  if (!v.ok)
    return Response.json(
      {
        error:
          "ไม่สามารถดำเนินการได้ เนื่องจากข้อมูลเคสไม่ถูกต้อง กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ",
      },
      { status: 400 },
    );
  const b = await req.json().catch(() => ({}));
  const action = b.action || "approve";
  const status =
    action === "not_relevant"
      ? "not_relevant"
      : action === "correct"
        ? "corrected"
        : "approved";
  // reviewed_by เป็น TEXT (ให้ตรงกับ qc_disputes/registration) — เก็บชื่อผู้ตรวจ ไม่ใช่ uid ตัวเลข
  const reviewer = me?.name || (me?.uid != null ? String(me.uid) : "system");
  // corrected_sop_id เป็น INTEGER (sop_scripts.id) — validate ให้เป็นตัวเลขหรือ null
  const correctedSopId =
    b.corrected_sop_id == null ? null : parseNumericId(b.corrected_sop_id);
  try {
    const rows = await query`
      UPDATE ai_review_queue SET
        status = ${status},
        review_action = ${action},
        corrected_intent = ${b.corrected_intent ?? null},
        corrected_sop_id = ${correctedSopId},
        reviewer_note = ${b.reviewer_note ?? null},
        reviewed_by = ${reviewer},
        reviewed_at = now()
      WHERE id = ${v.value}::uuid RETURNING *`;
    if (!rows[0])
      return Response.json({ error: "ไม่พบเคสนี้ในระบบ" }, { status: 404 });
    // ถ้าแก้ intent/SOP ให้อัปเดต qc_scores ที่เกี่ยว (ปรับ intent/matched sop)
    if (action === "correct" && rows[0].qc_score_id) {
      await query`UPDATE qc_scores SET intent = COALESCE(${b.corrected_intent ?? null}, intent),
                    matched_sop_id = COALESCE(${correctedSopId}, matched_sop_id)
                  WHERE id = ${rows[0].qc_score_id}`.catch(() => {});
    }
    return Response.json({ ok: true, item: rows[0] });
  } catch (e) {
    // เก็บ error เต็มไว้ที่ server log, คืนข้อความไทยที่ผู้ใช้เข้าใจ
    console.error("[ai-review PATCH]", e.message);
    return Response.json(
      {
        error:
          "ไม่สามารถบันทึกผลการตรวจได้ กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาโปรดติดต่อผู้ดูแลระบบ",
      },
      { status: 500 },
    );
  }
}

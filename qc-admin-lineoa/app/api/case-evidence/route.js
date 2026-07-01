// ============================================================
// GET /api/case-evidence — หลักฐานอ้างอิงของเคส (Evidence Viewer)
// ------------------------------------------------------------
//   Query (อย่างน้อย 1 ตัว):
//     qc_score_id      : ดึงหลักฐานของ qc_score นั้น
//     conversation_id  : ดึงหลักฐานของทั้งบทสนทนา
//   Response: { evidence: [{ evidence_type, title, file_path, url, data, created_at }] }
//     evidence_type: chat_text | raw_json | late_response | screenshot | html | sop | system
//   Permission (server-enforced): qc.score.view หรือ chat.review
//   หลักฐานถูกสร้างอัตโนมัติสำหรับเคส fail/late/fatal (ดู lib/qc-review.js saveQcEvidence)
// ============================================================
import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";

export async function GET(req) {
  // ต้องมีสิทธิ์ดูคะแนน หรือรีวิวแชท
  const gate = guard(req, "qc.score.view", "chat.review");
  if (gate) return gate;
  const sp = new URL(req.url).searchParams;
  const qcId = sp.get("qc_score_id");
  const convId = sp.get("conversation_id");
  // ต้องระบุ scope อย่างน้อย 1 อย่าง (กันดึงทั้งตาราง)
  if (!qcId && !convId)
    return Response.json(
      { error: "qc_score_id หรือ conversation_id required" },
      { status: 400 },
    );
  try {
    // ดึงหลักฐานเรียงตามเวลา (เก่า→ใหม่) เพื่อไล่ timeline ของเคส
    const rows = await query`
      SELECT id, qc_score_id, conversation_id, scraper_job_id, evidence_type, title, file_path, url, data, created_at
      FROM case_evidence
      WHERE (${qcId}::uuid IS NULL OR qc_score_id = ${qcId}::uuid)
        AND (${convId}::uuid IS NULL OR conversation_id = ${convId}::uuid)
      ORDER BY created_at ASC`;
    return Response.json({ evidence: rows });
  } catch (e) {
    // ตารางยังไม่ migrate → คืน evidence ว่างแทน crash
    return Response.json({ error: e.message, evidence: [] }, { status: 500 });
  }
}

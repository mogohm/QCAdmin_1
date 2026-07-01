// GET /api/case-evidence?qc_score_id=&conversation_id= — หลักฐานของเคส (Evidence Viewer)
//   ต้องมีสิทธิ์ qc.score.view หรือ chat.review
import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";

export async function GET(req) {
  const gate = guard(req, "qc.score.view", "chat.review");
  if (gate) return gate;
  const sp = new URL(req.url).searchParams;
  const qcId = sp.get("qc_score_id");
  const convId = sp.get("conversation_id");
  if (!qcId && !convId)
    return Response.json(
      { error: "qc_score_id หรือ conversation_id required" },
      { status: 400 },
    );
  try {
    const rows = await query`
      SELECT id, qc_score_id, conversation_id, scraper_job_id, evidence_type, title, file_path, url, data, created_at
      FROM case_evidence
      WHERE (${qcId}::uuid IS NULL OR qc_score_id = ${qcId}::uuid)
        AND (${convId}::uuid IS NULL OR conversation_id = ${convId}::uuid)
      ORDER BY created_at ASC`;
    return Response.json({ evidence: rows });
  } catch (e) {
    return Response.json({ error: e.message, evidence: [] }, { status: 500 });
  }
}

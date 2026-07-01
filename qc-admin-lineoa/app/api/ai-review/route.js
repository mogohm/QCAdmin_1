// GET /api/ai-review?status=pending — คิวเคสที่ AI ไม่มั่นใจ (ให้ QC/หัวหน้าตรวจ)
//   ต้องมีสิทธิ์ qc.dispute.review หรือ qc.score.override
import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";

export async function GET(req) {
  const gate = guard(req, "qc.dispute.review", "qc.score.override");
  if (gate) return gate;
  const status = new URL(req.url).searchParams.get("status") || "pending";
  try {
    const rows = await query`
      SELECT r.*, s.topic AS matched_sop_topic, s.answer AS matched_sop_answer
      FROM ai_review_queue r
      LEFT JOIN sop_scripts s ON s.id = r.matched_sop_id
      WHERE (${status}::text = 'all' OR r.status = ${status})
      ORDER BY r.status = 'pending' DESC, r.created_at DESC
      LIMIT 200`;
    const counts =
      await query`SELECT status, count(*)::int n FROM ai_review_queue GROUP BY status`.catch(
        () => [],
      );
    return Response.json({ items: rows, counts });
  } catch (e) {
    return Response.json({ error: e.message, items: [] }, { status: 500 });
  }
}

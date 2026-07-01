// POST /api/knowledge-training/test-match — ทดสอบว่าคำถามลูกค้า match SOP ไหน (ปุ่ม "ทดสอบการจับคู่")
//   body: { question }   ต้องมีสิทธิ์ sop.view/create/update
import { guard } from "@/lib/permissions";
import { matchSOP } from "@/lib/sop-matcher";
import { loadKnowledge } from "@/lib/qc-shared";

export async function POST(req) {
  const gate = guard(req, "sop.view", "sop.create", "sop.update");
  if (gate) return gate;
  const b = await req.json().catch(() => ({}));
  if (!b.question)
    return Response.json({ error: "question required" }, { status: 400 });
  try {
    const { sops } = await loadKnowledge();
    const m = matchSOP(b.question, sops) || {};
    const sop = m.sop || null;
    return Response.json({
      matched: !!sop,
      confidence: m.confidence ?? sop?.confidence ?? null,
      sop: sop
        ? {
            id: sop.id,
            topic: sop.topic,
            answer: sop.answer,
            intent: sop.intent,
          }
        : null,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ============================================================
// POST /api/evidence — อัปโหลดหลักฐานจาก scraper เข้า case_evidence (service)
// ------------------------------------------------------------
//   Auth: x-api-key (requireAdmin) — scraper บนเครื่อง capture screenshot แล้วส่ง base64 มาเก็บ
//   Body: {
//     conversation_id?, qc_score_id?, scraper_job_id?,
//     items: [{ evidence_type, title, image_base64?, data?, file_path?, url? }]
//   }
//   image_base64 (data URL หรือ base64 ล้วน) → เก็บใน data.image เพื่อให้ UI แสดง <img> ได้ทันที
//     (self-contained บน Vercel — ไม่ต้องพึ่ง external storage)
// ============================================================
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { storeImage, evidenceStorageMode } from "@/lib/evidence-storage";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const IMG_TYPES = [
  "chat_header_png",
  "chat_panel_png",
  "chat_part_png",
  "chat_long_png",
  "screenshot",
];

export async function POST(req) {
  if (!requireAdmin(req))
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: CORS },
    );
  const b = await req.json().catch(() => ({}));
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length)
    return Response.json(
      { error: "items required" },
      { status: 400, headers: CORS },
    );
  if (!b.conversation_id && !b.qc_score_id)
    return Response.json(
      { error: "conversation_id หรือ qc_score_id required" },
      { status: 400, headers: CORS },
    );

  let saved = 0;
  const stored = new Set();
  try {
    for (const it of items) {
      if (!it || !it.evidence_type) continue;
      const data = it.data || {};
      let url = it.url || null;
      // รูปภาพ → อัปโหลดผ่าน storage adapter (blob → https url, ไม่งั้น data URL)
      if (it.image_base64 && !url) {
        const key = `${b.conversation_id || b.qc_score_id}/${it.evidence_type}-${Date.now()}`;
        const r = await storeImage(it.image_base64, key);
        url = r.url;
        stored.add(r.storage);
      }
      await query`
        INSERT INTO case_evidence (qc_score_id, conversation_id, scraper_job_id, evidence_type, title, file_path, url, data)
        VALUES (${b.qc_score_id || null}, ${b.conversation_id || null}, ${b.scraper_job_id || null},
                ${it.evidence_type}, ${it.title || null}, ${it.file_path || null}, ${url},
                ${JSON.stringify(data)})`;
      saved++;
    }
    return Response.json(
      { ok: true, saved, storage: evidenceStorageMode(), used: [...stored] },
      { headers: CORS },
    );
  } catch (e) {
    return Response.json(
      { error: e.message, saved },
      { status: 500, headers: CORS },
    );
  }
}

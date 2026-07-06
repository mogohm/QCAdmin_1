// ============================================================
// GET /api/case-evidence — Evidence Bundle ของเคส (Evidence Viewer gallery)
// ------------------------------------------------------------
//   Query (อย่างน้อย 1): qc_score_id | conversation_id
//   Response: {
//     summary: {...} | null,     // คู่ข้อความที่ให้คะแนน + เวลา + คะแนน + เหตุผล
//     screenshots: [{type,title,url,file_path,created_at}],  // ภาพแชทจริง (base64/url)
//     htmlSnapshots: [...],      // HTML/DOM snapshot
//     rawData: [...],            // parsed/raw json + chat_text + late_response
//     timeline: {...} | null,    // เวลา customer→admin + response time
//     counts: { screenshots, html, raw }
//   }
//   Permission (server-enforced): qc.score.view หรือ chat.review
//   Masking: role ที่ไม่มี chat.view.all จะถูกปิดบังเบอร์/ไอดีลูกค้า
// ============================================================
import { query } from "@/lib/db";
import { guard, getCurrentUser, hasPermission } from "@/lib/permissions";

const IMG_TYPES = [
  "chat_header_png",
  "chat_panel_png",
  "chat_part_png",
  "chat_long_png",
  "screenshot",
  // exact-pair evidence (ผูกกับคู่ข้อความที่ให้คะแนนโดยตรง)
  "pair_focus_png",
  "pair_context_png",
  "chat_identity_png",
];
const HTML_TYPES = ["html_snapshot", "html"];

// ปิดบังเบอร์โทร/ไอดี (แสดงเฉพาะ 3 ตัวท้าย)
function mask(text) {
  if (!text) return text;
  return String(text).replace(
    /\d{5,}/g,
    (m) => "•".repeat(Math.max(0, m.length - 3)) + m.slice(-3),
  );
}
function maskData(d) {
  if (!d || typeof d !== "object") return d;
  const out = { ...d };
  for (const k of ["customer_text", "admin_text", "customer_name"]) {
    if (typeof out[k] === "string") out[k] = mask(out[k]);
  }
  return out;
}

export async function GET(req) {
  const gate = guard(req, "qc.score.view", "chat.review");
  if (gate) return gate;
  const me = getCurrentUser(req);
  const canFull = hasPermission(me, "chat.view.all"); // เห็นข้อมูลลูกค้าเต็ม
  const sp = new URL(req.url).searchParams;
  const qcId = sp.get("qc_score_id");
  const convId = sp.get("conversation_id");
  if (!qcId && !convId)
    return Response.json(
      { error: "qc_score_id หรือ conversation_id required" },
      { status: 400 },
    );
  try {
    // OR: evidence ที่ผูกกับ qc_score นี้ "หรือ" กับ conversation นี้
    //   (scraper เก็บ screenshot ผูก conversation_id, ส่วน summary/chat_text ผูก qc_score_id)
    const rows = await query`
      SELECT id, qc_score_id, conversation_id, scraper_job_id, evidence_type, title, file_path, url, data, created_at,
             case_ref, evidence_scope, match_status, match_confidence, customer_message_id, admin_message_id
      FROM case_evidence
      WHERE (${qcId}::uuid IS NOT NULL AND qc_score_id = ${qcId}::uuid)
         OR (${convId}::uuid IS NOT NULL AND conversation_id = ${convId}::uuid)
      ORDER BY created_at ASC`;

    const screenshots = [];
    const htmlSnapshots = [];
    const rawData = [];
    let summary = null;
    let timeline = null;

    for (const ev of rows) {
      const data = canFull ? ev.data : maskData(ev.data);
      if (IMG_TYPES.includes(ev.evidence_type)) {
        // exact-pair contract: scope/match — ภาพเก่าที่ผูกแค่ conversation = legacy_unlinked
        //   ห้ามแสดงเป็นหลักฐาน exact ของเคส (แสดงเป็น "ภาพอ้างอิงระดับห้องแชท" พร้อมคำเตือน)
        const scope = ev.evidence_scope || "conversation_reference";
        const matchStatus = ev.match_status || "legacy_unlinked";
        // exact ต้องผูก qc_score เดียวกันจริง (กันภาพ exact ของเคสอื่นใน conversation เดียวกัน)
        const belongsToCase = qcId && ev.qc_score_id === qcId;
        screenshots.push({
          id: ev.id,
          type: ev.evidence_type,
          title: ev.title,
          url: ev.url || data?.image || null, // data URL หรือ external url
          file_path: ev.file_path,
          created_at: ev.created_at,
          case_ref: ev.case_ref || null,
          evidence_scope: scope,
          match_status: belongsToCase || !qcId ? matchStatus : "legacy_unlinked",
          match_confidence: ev.match_confidence != null ? Number(ev.match_confidence) : null,
          pair: data?.pair ? (canFull ? data.pair : maskData(data.pair)) : null,
        });
      } else if (HTML_TYPES.includes(ev.evidence_type)) {
        htmlSnapshots.push({
          id: ev.id,
          type: ev.evidence_type,
          title: ev.title,
          file_path: ev.file_path,
          url: ev.url,
          html: data?.html || null,
          created_at: ev.created_at,
        });
      } else {
        rawData.push({
          id: ev.id,
          type: ev.evidence_type,
          title: ev.title,
          data,
          created_at: ev.created_at,
        });
        if (ev.evidence_type === "summary_json" && !summary) summary = data;
        if (ev.evidence_type === "late_response" && !timeline)
          timeline = {
            customer_ts:
              data?.customer_ts || summary?.customer_created_at || null,
            admin_ts: data?.admin_ts || summary?.admin_created_at || null,
            response_seconds:
              data?.response_seconds ?? summary?.response_seconds ?? null,
            sla_limit_seconds: data?.sla_limit_seconds ?? null,
          };
      }
    }
    // ถ้าไม่มี late_response แต่มี summary → สร้าง timeline จาก summary
    if (
      !timeline &&
      summary &&
      (summary.customer_created_at || summary.admin_created_at)
    ) {
      timeline = {
        customer_ts: summary.customer_created_at,
        admin_ts: summary.admin_created_at,
        response_seconds: summary.response_seconds ?? null,
        sla_limit_seconds: null,
      };
    }

    return Response.json({
      summary,
      timeline,
      screenshots,
      htmlSnapshots,
      rawData,
      counts: {
        screenshots: screenshots.length,
        html: htmlSnapshots.length,
        raw: rawData.length,
      },
      masked: !canFull,
    });
  } catch (e) {
    return Response.json(
      { error: e.message, screenshots: [], htmlSnapshots: [], rawData: [] },
      { status: 500 },
    );
  }
}

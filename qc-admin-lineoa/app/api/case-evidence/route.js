// ============================================================
// GET /api/case-evidence — Evidence Bundle ของเคส (Evidence Viewer)
// ------------------------------------------------------------
//   INTEGRITY CONTRACT (ห้ามผสมเคส):
//     - exactEvidence      : WHERE qc_score_id = $qc เท่านั้น (ไม่มี OR conversation)
//     - conversationReferences : ภาพระดับห้องแชท/ของเคสอื่นใน conversation เดียวกัน
//     - แยก array เสมอ — ไม่ merge
//     - ทุก exact item มี identity_check (server-side) — แท็บ exact ต้อง all_match === true
//     - ไม่มี qc_score_id → exactEvidence = [] (ทุกภาพเป็น reference เท่านั้น)
//   Query: qc_score_id | conversation_id (อย่างน้อย 1)
//   Permission: qc.score.view หรือ chat.review · masking เมื่อไม่มี chat.view.all
// ============================================================
import { query } from "@/lib/db";
import { guard, getCurrentUser, hasPermission } from "@/lib/permissions";
import { buildIdentityCheck } from "@/lib/evidence-integrity";

const IMG_TYPES = [
  "chat_header_png",
  "chat_panel_png",
  "chat_part_png",
  "chat_long_png",
  "screenshot",
  "pair_focus_png",
  "pair_context_png",
  "chat_identity_png",
];
const HTML_TYPES = ["html_snapshot", "html"];

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

const toShot = (ev, canFull) => {
  const data = canFull ? ev.data : maskData(ev.data);
  return {
    id: ev.id,
    evidence_id: ev.id,
    type: ev.evidence_type,
    title: ev.title,
    url: ev.url || data?.image || null,
    file_path: ev.file_path,
    created_at: ev.created_at,
    qc_score_id: ev.qc_score_id,
    conversation_id: ev.conversation_id,
    case_ref: ev.case_ref || null,
    customer_message_id: ev.customer_message_id || null,
    admin_message_id: ev.admin_message_id || null,
    customer_message_ids: ev.customer_source_keys ? undefined : undefined, // ids จริงอยู่ใน manifest
    evidence_scope: ev.evidence_scope || "conversation_reference",
    match_status: ev.match_status || "legacy_unlinked",
    match_confidence: ev.match_confidence != null ? Number(ev.match_confidence) : null,
    verification_status: ev.verification_status || null,
    pair: ev.data?.pair ? (canFull ? ev.data.pair : maskData(ev.data.pair)) : null,
    capture_manifest: ev.data?.capture_manifest || null,
  };
};

export async function GET(req) {
  const gate = guard(req, "qc.score.view", "chat.review");
  if (gate) return gate;
  const me = getCurrentUser(req);
  const canFull = hasPermission(me, "chat.view.all");
  const sp = new URL(req.url).searchParams;
  const qcId = sp.get("qc_score_id") || null;
  const convId = sp.get("conversation_id") || null;
  if (!qcId && !convId)
    return Response.json(
      { error: "qc_score_id หรือ conversation_id required" },
      { status: 400 },
    );
  try {
    // ---- selectedCase: ความจริงของเคสที่เปิด (จาก qc_scores) ----
    let selectedCase = null;
    if (qcId) {
      const sc = await query`
        SELECT id AS qc_score_id, case_ref, conversation_id,
               customer_message_id, admin_message_id, customer_message_ids, admin_message_ids
        FROM qc_scores WHERE id = ${qcId}::uuid`.catch(() => []);
      if (sc[0])
        selectedCase = {
          qc_score_id: sc[0].qc_score_id,
          case_ref: sc[0].case_ref,
          conversation_id: sc[0].conversation_id,
          customer_message_ids: sc[0].customer_message_ids || (sc[0].customer_message_id ? [sc[0].customer_message_id] : []),
          admin_message_ids: sc[0].admin_message_ids || (sc[0].admin_message_id ? [sc[0].admin_message_id] : []),
        };
    }
    const convForRef = convId || selectedCase?.conversation_id || null;

    // ---- exact: เฉพาะ qc_score_id นี้เท่านั้น (ไม่มี OR) ----
    const exactRows = qcId
      ? await query`
          SELECT id, qc_score_id, conversation_id, scraper_job_id, evidence_type, title, file_path, url, data, created_at,
                 case_ref, evidence_scope, match_status, match_confidence, verification_status,
                 customer_message_id, admin_message_id
          FROM case_evidence WHERE qc_score_id = ${qcId}::uuid
          ORDER BY created_at ASC`
      : [];

    // ---- conversation references: ภาพห้องแชท/เคสอื่น (ห้าม merge กับ exact) ----
    const refRows = convForRef
      ? await query`
          SELECT id, qc_score_id, conversation_id, evidence_type, title, file_path, url, data, created_at,
                 case_ref, evidence_scope, match_status, match_confidence, verification_status,
                 customer_message_id, admin_message_id
          FROM case_evidence
          WHERE conversation_id = ${convForRef}::uuid
            AND (qc_score_id IS NULL OR ${qcId}::uuid IS NULL OR qc_score_id <> ${qcId}::uuid)
          ORDER BY created_at ASC LIMIT 100`
      : [];

    const exactEvidence = [];
    const conversationReferences = [];
    const htmlSnapshots = [];
    const rawData = [];
    let summary = null;
    let timeline = null;

    for (const ev of exactRows) {
      const data = canFull ? ev.data : maskData(ev.data);
      if (IMG_TYPES.includes(ev.evidence_type)) {
        const shot = toShot(ev, canFull);
        // identity_check ฝั่ง server — แท็บ exact ต้อง all_match เท่านั้น
        const manifest = ev.data?.capture_manifest || {};
        shot.identity_check = buildIdentityCheck(selectedCase, {
          qc_score_id: ev.qc_score_id,
          case_ref: ev.case_ref,
          conversation_id: ev.conversation_id,
          customer_message_ids: manifest.expected_customer_message_ids || (ev.customer_message_id ? [ev.customer_message_id] : null),
          admin_message_ids: manifest.expected_admin_message_ids || (ev.admin_message_id ? [ev.admin_message_id] : null),
        });
        exactEvidence.push(shot);
      } else if (HTML_TYPES.includes(ev.evidence_type)) {
        htmlSnapshots.push({ id: ev.id, type: ev.evidence_type, title: ev.title, file_path: ev.file_path, url: ev.url, html: data?.html || null, created_at: ev.created_at });
      } else {
        rawData.push({ id: ev.id, type: ev.evidence_type, title: ev.title, data, created_at: ev.created_at });
        if (ev.evidence_type === "summary_json" && !summary) summary = data;
        if (ev.evidence_type === "late_response" && !timeline)
          timeline = {
            customer_ts: data?.customer_ts || null,
            admin_ts: data?.admin_ts || null,
            response_seconds: data?.response_seconds ?? null,
            sla_limit_seconds: data?.sla_limit_seconds ?? null,
          };
      }
    }
    for (const ev of refRows) {
      const data = canFull ? ev.data : maskData(ev.data);
      if (IMG_TYPES.includes(ev.evidence_type)) {
        const shot = toShot(ev, canFull);
        shot.match_status = "legacy_unlinked"; // reference เสมอ — ไม่ว่าค่าเดิมจะเป็นอะไร
        conversationReferences.push(shot);
      } else if (HTML_TYPES.includes(ev.evidence_type) && !qcId) {
        htmlSnapshots.push({ id: ev.id, type: ev.evidence_type, title: ev.title, file_path: ev.file_path, url: ev.url, html: data?.html || null, created_at: ev.created_at });
      } else if (!qcId && !HTML_TYPES.includes(ev.evidence_type)) {
        rawData.push({ id: ev.id, type: ev.evidence_type, title: ev.title, data, created_at: ev.created_at });
        if (ev.evidence_type === "summary_json" && !summary) summary = data;
      }
    }
    if (!timeline && summary && (summary.customer_created_at || summary.admin_created_at))
      timeline = { customer_ts: summary.customer_created_at, admin_ts: summary.admin_created_at, response_seconds: summary.response_seconds ?? null, sla_limit_seconds: null };

    // supportingData = ข้อมูลประกอบ (late_response/raw_json/chat_text/summary_json/html)
    //   ไม่ใช่ "ภาพ" — ห้ามนับรวมเป็นภาพหลักฐาน
    const supportingData = [...rawData, ...htmlSnapshots.map((h) => ({ ...h, data: undefined }))];
    const exactImages = exactEvidence.filter((s) => s.verification_status === "verified" && s.match_status === "exact");
    return Response.json({
      selectedCase,
      exactEvidence,
      conversationReferences,
      supportingData,
      // deprecated alias (เท่ากับ exactEvidence เท่านั้น — ไม่ merge references)
      screenshots: exactEvidence,
      htmlSnapshots,
      rawData,
      summary,
      timeline,
      counts: {
        exact_images: exactImages.length,
        reference_images: conversationReferences.length + (exactEvidence.length - exactImages.length),
        supporting_records: supportingData.length,
        exact: exactEvidence.length,
        references: conversationReferences.length,
        screenshots: exactEvidence.length,
        html: htmlSnapshots.length,
        raw: rawData.length,
      },
      masked: !canFull,
    });
  } catch (e) {
    console.error("[case-evidence]", e.message);
    return Response.json(
      { error: "โหลดหลักฐานไม่สำเร็จ", exactEvidence: [], conversationReferences: [], screenshots: [], htmlSnapshots: [], rawData: [] },
      { status: 500 },
    );
  }
}

// ============================================================
// POST /api/admin/migrate-uat — สร้าง/อัปเดตตาราง UAT feedback (idempotent)
// ------------------------------------------------------------
//   สร้าง:
//     - ai_review_queue  (คิวเคสที่ AI ไม่มั่นใจ ให้หัวหน้าตรวจ)
//     - case_evidence    (หลักฐานอ้างอิงแต่ละเคส)
//   ALTER/ADD:
//     - sop_scripts.knowledge_type / example_questions / source_case_id / training_status
//     - messages.source (manual/scraper/webhook)
//   ปลอดภัยเมื่อเรียกซ้ำ (CREATE/ALTER IF NOT EXISTS + DO block เช็คชนิดคอลัมน์)
//   Auth: x-api-key (requireAdmin) — ใช้ตอน deploy/migration เท่านั้น
//   หมายเหตุ: schema.sql มีตารางเหล่านี้ครบแล้ว (รัน schema ครั้งเดียวก็ได้ระบบครบ)
//   route นี้ไว้ apply กับ prod ที่มีข้อมูลอยู่แล้วโดยไม่ต้องรัน schema.sql ใหม่
// ============================================================
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function POST(req) {
  if (!requireAdmin(req))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    // ---- AI review queue: เคสที่ AI ไม่มั่นใจ/ไม่เข้าใจ ให้ QC/หัวหน้าตรวจ ----
    // matched_sop_id/corrected_sop_id = INTEGER (sop_scripts.id เป็น integer)
    await query`CREATE TABLE IF NOT EXISTS ai_review_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      qc_score_id UUID, conversation_id UUID, message_id UUID,
      customer_name TEXT, admin_name TEXT, customer_text TEXT, admin_text TEXT,
      detected_intent TEXT, intent_confidence NUMERIC,
      matched_sop_id INTEGER, sop_confidence NUMERIC,
      reason TEXT, status TEXT DEFAULT 'pending',
      reviewed_by UUID, review_action TEXT, corrected_intent TEXT, corrected_sop_id INTEGER,
      reviewer_note TEXT, created_at TIMESTAMPTZ DEFAULT now(), reviewed_at TIMESTAMPTZ)`;
    await query`CREATE INDEX IF NOT EXISTS idx_ai_review_status ON ai_review_queue (status, created_at DESC)`;
    // แก้ชนิดคอลัมน์ให้ตรง sop_scripts.id ถ้าตารางถูกสร้างเป็น uuid มาก่อน (ปลอดภัย: ตารางว่าง)
    await query`DO $$ BEGIN
      IF (SELECT data_type FROM information_schema.columns WHERE table_name='ai_review_queue' AND column_name='matched_sop_id') = 'uuid' THEN
        ALTER TABLE ai_review_queue ALTER COLUMN matched_sop_id TYPE INTEGER USING NULL;
        ALTER TABLE ai_review_queue ALTER COLUMN corrected_sop_id TYPE INTEGER USING NULL;
      END IF;
    END $$;`;
    // ---- EVIDENCE EXACT-PAIR: source_message_key + qc pair ids/keys + evidence contract ----
    await query`ALTER TABLE messages ADD COLUMN IF NOT EXISTS source_message_key TEXT`;
    await query`CREATE INDEX IF NOT EXISTS idx_messages_source_key ON messages (source_message_key)`;
    await query`ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS customer_message_ids JSONB`;
    await query`ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS admin_message_ids JSONB`;
    await query`ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS customer_source_keys JSONB`;
    await query`ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS admin_source_keys JSONB`;
    await query`ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS case_ref TEXT`;
    await query`UPDATE qc_scores SET case_ref =
        'QC-' || to_char(created_at AT TIME ZONE 'Asia/Bangkok','YYYYMMDD') || '-' || upper(substr(md5(id::text),1,6))
      WHERE case_ref IS NULL`;
    await query`ALTER TABLE case_evidence ADD COLUMN IF NOT EXISTS case_ref TEXT`;
    await query`ALTER TABLE case_evidence ADD COLUMN IF NOT EXISTS customer_message_id UUID`;
    await query`ALTER TABLE case_evidence ADD COLUMN IF NOT EXISTS admin_message_id UUID`;
    await query`ALTER TABLE case_evidence ADD COLUMN IF NOT EXISTS customer_source_keys JSONB`;
    await query`ALTER TABLE case_evidence ADD COLUMN IF NOT EXISTS admin_source_keys JSONB`;
    await query`ALTER TABLE case_evidence ADD COLUMN IF NOT EXISTS evidence_scope TEXT`;
    await query`ALTER TABLE case_evidence ADD COLUMN IF NOT EXISTS match_status TEXT`;
    await query`ALTER TABLE case_evidence ADD COLUMN IF NOT EXISTS match_confidence NUMERIC`;
    // legacy: ภาพเดิมที่ link แค่ conversation → จัดเป็น "ภาพอ้างอิงระดับห้องแชท" ห้ามแสดงเป็นหลักฐาน exact
    await query`UPDATE case_evidence SET evidence_scope='conversation_reference', match_status='legacy_unlinked'
      WHERE evidence_scope IS NULL`;

    // ---- ai_review_queue: เชื่อมโยงตรงถึงคู่ข้อความ + case identity (ห้ามพึ่ง customer_name/เดาวันที่) ----
    await query`ALTER TABLE ai_review_queue ADD COLUMN IF NOT EXISTS customer_message_id UUID`;
    await query`ALTER TABLE ai_review_queue ADD COLUMN IF NOT EXISTS admin_message_id UUID`;
    await query`ALTER TABLE ai_review_queue ADD COLUMN IF NOT EXISTS customer_created_at TIMESTAMPTZ`;
    await query`ALTER TABLE ai_review_queue ADD COLUMN IF NOT EXISTS admin_created_at TIMESTAMPTZ`;
    await query`ALTER TABLE ai_review_queue ADD COLUMN IF NOT EXISTS response_seconds INT`;
    await query`ALTER TABLE ai_review_queue ADD COLUMN IF NOT EXISTS scraper_job_id UUID`;
    await query`ALTER TABLE ai_review_queue ADD COLUMN IF NOT EXISTS source TEXT`;
    await query`ALTER TABLE ai_review_queue ADD COLUMN IF NOT EXISTS case_ref TEXT`;
    await query`CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_review_case_ref ON ai_review_queue (case_ref) WHERE case_ref IS NOT NULL`;
    // backfill จาก qc_scores (แหล่งความจริงของคู่ข้อความ)
    await query`UPDATE ai_review_queue r SET
        customer_message_id = COALESCE(r.customer_message_id, q.customer_message_id),
        admin_message_id    = COALESCE(r.admin_message_id, q.admin_message_id),
        response_seconds    = COALESCE(r.response_seconds, q.response_seconds),
        scraper_job_id      = COALESCE(r.scraper_job_id, q.scraper_job_id),
        source              = COALESCE(r.source, q.source)
      FROM qc_scores q WHERE q.id = r.qc_score_id`;
    // backfill เวลาแต่ละฝั่งจาก messages จริง
    await query`UPDATE ai_review_queue r SET customer_created_at = m.created_at
      FROM messages m WHERE m.id = r.customer_message_id AND r.customer_created_at IS NULL`;
    await query`UPDATE ai_review_queue r SET admin_created_at = m.created_at
      FROM messages m WHERE m.id = r.admin_message_id AND r.admin_created_at IS NULL`;
    // message_id เดิม (ถ้ามี) = admin message
    await query`UPDATE ai_review_queue SET admin_message_id = COALESCE(admin_message_id, message_id) WHERE message_id IS NOT NULL`;
    // source: แถวเก่าที่ qc_scores ไม่มี → ใช้ source ของ conversation / scraper_job จาก messages
    await query`UPDATE ai_review_queue r SET source = c.source
      FROM conversations c WHERE c.id = r.conversation_id AND r.source IS NULL AND c.source IS NOT NULL`;
    await query`UPDATE ai_review_queue r SET scraper_job_id = m.scraper_job_id
      FROM messages m WHERE m.id = r.admin_message_id AND r.scraper_job_id IS NULL AND m.scraper_job_id IS NOT NULL`;
    // case_ref: QC-YYYYMMDD-XXXXXX (Bangkok day + md5 สั้นจาก id — เสถียร, unique)
    await query`UPDATE ai_review_queue SET case_ref =
        'QC-' || to_char((COALESCE(customer_created_at, created_at)) AT TIME ZONE 'Asia/Bangkok','YYYYMMDD')
        || '-' || upper(substr(md5(id::text),1,6))
      WHERE case_ref IS NULL`;

    // reviewed_by: UUID → TEXT ให้ตรงกับ qc_disputes/registration (เก็บชื่อผู้ตรวจ)
    //   เดิมเป็น UUID แต่ session uid = app_users.id (SERIAL/integer) → insert แล้วพัง
    //   "invalid input syntax for type uuid: 23" ปลอดภัย: ค่าเดิมเป็น NULL ทั้งหมด (insert เคยพังมาตลอด)
    await query`DO $$ BEGIN
      IF (SELECT data_type FROM information_schema.columns WHERE table_name='ai_review_queue' AND column_name='reviewed_by') = 'uuid' THEN
        ALTER TABLE ai_review_queue ALTER COLUMN reviewed_by TYPE TEXT USING reviewed_by::text;
      END IF;
    END $$;`;

    // ---- Case evidence: หลักฐานอ้างอิงแต่ละเคส (screenshot/html/raw/late_response) ----
    await query`CREATE TABLE IF NOT EXISTS case_evidence (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      qc_score_id UUID, conversation_id UUID, scraper_job_id UUID,
      evidence_type TEXT, title TEXT, file_path TEXT, url TEXT,
      data JSONB, created_at TIMESTAMPTZ DEFAULT now())`;
    // index สำหรับ lookup หลักฐานตาม qc_score / conversation
    await query`CREATE INDEX IF NOT EXISTS idx_case_evidence_qc ON case_evidence (qc_score_id)`;
    await query`CREATE INDEX IF NOT EXISTS idx_case_evidence_conv ON case_evidence (conversation_id)`;

    // ---- sop_scripts: ฟิลด์สำหรับ AI Knowledge Training ----
    //   knowledge_type    : หมวดความรู้ (Poker/App/Game/Deposit/...)
    //   example_questions : ตัวอย่างคำถามลูกค้า (jsonb array)
    //   source_case_id    : qc_score_id ต้นทาง (ถ้าสร้างจากเคส AI Review)
    //   training_status   : active | off
    await query`ALTER TABLE sop_scripts ADD COLUMN IF NOT EXISTS knowledge_type TEXT`;
    await query`ALTER TABLE sop_scripts ADD COLUMN IF NOT EXISTS example_questions JSONB DEFAULT '[]'::jsonb`;
    await query`ALTER TABLE sop_scripts ADD COLUMN IF NOT EXISTS source_case_id UUID`;
    await query`ALTER TABLE sop_scripts ADD COLUMN IF NOT EXISTS training_status TEXT DEFAULT 'active'`;

    // ---- messages: source (manual/scraper/webhook) + scraper meta ----
    await query`ALTER TABLE messages ADD COLUMN IF NOT EXISTS source TEXT`;
    await query`ALTER TABLE messages ADD COLUMN IF NOT EXISTS scraper_job_id UUID`;
    await query`ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_hash TEXT`;
    await query`ALTER TABLE messages ADD COLUMN IF NOT EXISTS pending_reply BOOLEAN DEFAULT false`;
    await query`CREATE INDEX IF NOT EXISTS idx_messages_hash ON messages (conversation_id, message_hash)`;

    // ---- scraper_jobs: counters (JSONB) + mode (strict|deep_history) ----
    await query`ALTER TABLE scraper_jobs ADD COLUMN IF NOT EXISTS counters JSONB DEFAULT '{}'::jsonb`;
    await query`ALTER TABLE scraper_jobs ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'strict'`;

    // ---- line_customers/conversations: external_chat_key (เก็บแชทที่ไม่มี LINE user id ได้) ----
    await query`ALTER TABLE line_customers ADD COLUMN IF NOT EXISTS external_chat_key TEXT`;
    await query`CREATE UNIQUE INDEX IF NOT EXISTS uq_line_customers_extkey ON line_customers (external_chat_key) WHERE external_chat_key IS NOT NULL`;
    await query`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS external_chat_key TEXT`;

    // ---- conversations: scraper meta ----
    await query`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS source TEXT`;
    await query`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ`;
    await query`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_scraper_job_id UUID`;

    // ---- scraper_chat_results: ผลเก็บข้อมูลต่อแชท (audit + counters) ----
    await query`CREATE TABLE IF NOT EXISTS scraper_chat_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scraper_job_id UUID, conversation_id UUID, line_user_id TEXT,
      target_date_from DATE, target_date_to DATE,
      messages_found INTEGER DEFAULT 0, messages_inserted INTEGER DEFAULT 0,
      customer_messages INTEGER DEFAULT 0, admin_messages INTEGER DEFAULT 0,
      system_messages INTEGER DEFAULT 0, qc_pairs_created INTEGER DEFAULT 0,
      pending_reply_count INTEGER DEFAULT 0, duplicates_skipped INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ok', error_text TEXT, created_at TIMESTAMPTZ DEFAULT now())`;
    // เพิ่มคอลัมน์ให้ตารางที่สร้างไว้ก่อนหน้า (rerun-safe)
    await query`ALTER TABLE scraper_chat_results ADD COLUMN IF NOT EXISTS external_chat_key TEXT`;
    await query`ALTER TABLE scraper_chat_results ADD COLUMN IF NOT EXISTS pending_reply_messages INTEGER DEFAULT 0`;
    await query`CREATE INDEX IF NOT EXISTS idx_scraper_chat_results_job ON scraper_chat_results (scraper_job_id)`;

    // สรุปรายการที่ migrate สำเร็จ (idempotent — เรียกซ้ำได้)
    return Response.json({
      ok: true,
      migrated: [
        "ai_review_queue",
        "case_evidence",
        "sop_scripts.training",
        "messages.source/scraper_job_id/message_hash/pending_reply",
        "conversations.scraper_meta",
        "scraper_chat_results",
        "external_chat_key",
        "pending_reply_messages",
        "scraper_jobs.mode",
        "ai_review_queue.reviewed_by:text",
        "ai_review_queue.case_detail_linkage",
        "evidence.exact_pair_contract",
      ],
    });
  } catch (e) {
    // คืน error message เพื่อ debug ตอน deploy
    return Response.json({ error: e.message }, { status: 500 });
  }
}

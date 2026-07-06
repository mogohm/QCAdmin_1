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
      ],
    });
  } catch (e) {
    // คืน error message เพื่อ debug ตอน deploy
    return Response.json({ error: e.message }, { status: 500 });
  }
}

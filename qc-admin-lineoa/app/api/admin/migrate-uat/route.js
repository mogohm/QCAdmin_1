// migrate-uat — สร้างตาราง UAT feedback (ai_review_queue, case_evidence) + ฟิลด์ training ใน sop_scripts
//   idempotent (CREATE/ALTER IF NOT EXISTS) — เรียกด้วย x-api-key (requireAdmin)
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

    // ---- Case evidence: หลักฐานอ้างอิงแต่ละเคส (screenshot/html/raw/late_response) ----
    await query`CREATE TABLE IF NOT EXISTS case_evidence (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      qc_score_id UUID, conversation_id UUID, scraper_job_id UUID,
      evidence_type TEXT, title TEXT, file_path TEXT, url TEXT,
      data JSONB, created_at TIMESTAMPTZ DEFAULT now())`;
    await query`CREATE INDEX IF NOT EXISTS idx_case_evidence_qc ON case_evidence (qc_score_id)`;
    await query`CREATE INDEX IF NOT EXISTS idx_case_evidence_conv ON case_evidence (conversation_id)`;

    // ---- sop_scripts: ฟิลด์สำหรับ AI Knowledge Training ----
    await query`ALTER TABLE sop_scripts ADD COLUMN IF NOT EXISTS knowledge_type TEXT`;
    await query`ALTER TABLE sop_scripts ADD COLUMN IF NOT EXISTS example_questions JSONB DEFAULT '[]'::jsonb`;
    await query`ALTER TABLE sop_scripts ADD COLUMN IF NOT EXISTS source_case_id UUID`;
    await query`ALTER TABLE sop_scripts ADD COLUMN IF NOT EXISTS training_status TEXT DEFAULT 'active'`;

    // ---- messages: source (manual/scraper/webhook) ----
    await query`ALTER TABLE messages ADD COLUMN IF NOT EXISTS source TEXT`;

    return Response.json({
      ok: true,
      migrated: [
        "ai_review_queue",
        "case_evidence",
        "sop_scripts.training",
        "messages.source",
      ],
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

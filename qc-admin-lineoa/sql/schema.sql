CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS qc_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  role TEXT DEFAULT 'ADMIN',
  is_active BOOLEAN DEFAULT TRUE,
  source TEXT DEFAULT 'line_oa_manage_permissions',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(normalized_name)
);

CREATE TABLE IF NOT EXISTS line_customers (
  line_user_id TEXT PRIMARY KEY,
  display_name TEXT,
  picture_url TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  registered_status TEXT DEFAULT 'unknown',
  kyc_status TEXT DEFAULT 'unknown',
  deposit_amount NUMERIC(14,2) DEFAULT 0,
  promotion_code TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT REFERENCES line_customers(line_user_id),
  assigned_admin_id UUID REFERENCES qc_admins(id),
  status TEXT DEFAULT 'open',
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  line_user_id TEXT,
  admin_id UUID REFERENCES qc_admins(id),
  direction TEXT NOT NULL CHECK(direction IN ('customer','admin','system')),
  message_text TEXT,
  line_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code TEXT UNIQUE NOT NULL,
  rule_name TEXT NOT NULL,
  category TEXT NOT NULL,
  question_keywords JSONB NOT NULL DEFAULT '[]',
  answer_keywords JSONB NOT NULL DEFAULT '[]',
  weight NUMERIC(5,2) DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qc_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  customer_message_id UUID REFERENCES messages(id),
  admin_message_id UUID REFERENCES messages(id),
  admin_id UUID REFERENCES qc_admins(id),
  response_seconds INT,
  speed_score INT,
  correctness_score INT,
  sentiment_score INT,
  final_score INT,
  fail_reasons JSONB DEFAULT '[]',
  matched_rules JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT REFERENCES line_customers(line_user_id),
  event_type TEXT NOT NULL,
  status TEXT,
  amount NUMERIC(14,2),
  promotion_code TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scraper_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  status TEXT DEFAULT 'pending',
  total_chats INT DEFAULT 0,
  logged_count INT DEFAULT 0,
  current_chat TEXT,
  error_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT REFERENCES line_customers(line_user_id),
  note_text TEXT NOT NULL,
  noted_at TIMESTAMPTZ,
  noted_by TEXT,
  admin_id UUID REFERENCES qc_admins(id),
  scraped_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(line_user_id, note_text, noted_at)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO app_settings(key,value) VALUES ('response_limit_minutes','5') ON CONFLICT(key) DO NOTHING;
INSERT INTO knowledge_rules(rule_code,rule_name,category,question_keywords,answer_keywords) VALUES
('REG-001','ตอบคำถามสมัครสมาชิก','register','["สมัคร","ลงทะเบียน","register"]','["สมัคร","ลิงก์","เบอร์","ยืนยัน"]'),
('KYC-001','ตอบคำถาม KYC','kyc','["kyc","ยืนยันตัวตน","บัตร"]','["kyc","บัตร","ตรวจสอบ","อนุมัติ"]'),
('DEP-001','ตอบคำถามเติมเงิน','deposit','["เติมเงิน","ฝากเงิน","โอน"]','["ยอด","สลิป","ตรวจสอบ","บัญชี"]'),
('PRO-001','ตอบโปรโมชั่น','promotion','["โปร","โปรโมชั่น","โบนัส"]','["เงื่อนไข","ยอด","โบนัส","ระยะเวลา"]')
ON CONFLICT(rule_code) DO NOTHING;

-- ============================================================
-- Phase 2: SOP knowledge base + QC v3 + Dispute/SLA/Commission
-- ปลอดภัยต่อข้อมูลเดิม: CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- ============================================================

CREATE TABLE IF NOT EXISTS sop_categories (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sop_scripts (
  id SERIAL PRIMARY KEY,
  category_code TEXT,
  topic TEXT NOT NULL,
  question TEXT,
  answer TEXT NOT NULL,
  intent TEXT,
  keywords JSONB NOT NULL DEFAULT '[]',
  required_keywords JSONB NOT NULL DEFAULT '[]',
  forbidden_keywords JSONB NOT NULL DEFAULT '[]',
  escalation BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  source_sheet TEXT,
  source_row INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(topic)
);
CREATE INDEX IF NOT EXISTS idx_sop_scripts_intent ON sop_scripts(intent);
CREATE INDEX IF NOT EXISTS idx_sop_scripts_category ON sop_scripts(category_code);

CREATE TABLE IF NOT EXISTS intent_patterns (
  id SERIAL PRIMARY KEY,
  intent TEXT NOT NULL,
  pattern TEXT NOT NULL,
  lang TEXT DEFAULT 'th',
  weight NUMERIC(5,2) DEFAULT 1,
  UNIQUE(intent, pattern)
);
CREATE INDEX IF NOT EXISTS idx_intent_patterns_intent ON intent_patterns(intent);

CREATE TABLE IF NOT EXISTS fatal_rules (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  patterns JSONB NOT NULL DEFAULT '[]',
  applies_to TEXT,
  severity TEXT DEFAULT 'fatal',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- qc_scores: upgrade columns
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS intent TEXT;
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS matched_sop_id INT;
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS sop_confidence INT;
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS dimension_scores JSONB DEFAULT '{}';
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS is_fatal BOOLEAN DEFAULT false;
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS fatal_reasons JSONB DEFAULT '[]';
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS coaching JSONB;
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS sla_exception BOOLEAN DEFAULT false;
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}';

-- รายมิติของแต่ละ qc_score
CREATE TABLE IF NOT EXISTS qc_score_details (
  id SERIAL PRIMARY KEY,
  qc_score_id UUID REFERENCES qc_scores(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL,
  raw_score INT,
  weighted_score NUMERIC(6,2),
  max_score NUMERIC(6,2),
  pass BOOLEAN,
  evidence JSONB DEFAULT '{}',
  fail_reason TEXT,
  suggestion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qc_score_details_score ON qc_score_details(qc_score_id);

-- โต้แย้งผล AI
CREATE TABLE IF NOT EXISTS qc_disputes (
  id SERIAL PRIMARY KEY,
  qc_score_id UUID REFERENCES qc_scores(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES qc_admins(id),
  line_user_id TEXT,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  reviewer_note TEXT,
  reviewed_by TEXT,
  old_score INT,
  new_score INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_qc_disputes_status ON qc_disputes(status);

-- System events (SLA exception ช่วงธนาคารล่ม/ระบบปิด)
CREATE TABLE IF NOT EXISTS system_events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT DEFAULT 'system',
  affects_sla BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_events_active ON system_events(is_active, starts_at, ends_at);

-- ค่าคอมมิชชั่นรายแอดมิน/รอบ
CREATE TABLE IF NOT EXISTS admin_commissions (
  id SERIAL PRIMARY KEY,
  admin_id UUID REFERENCES qc_admins(id),
  period_start DATE,
  period_end DATE,
  avg_score INT,
  tier INT,
  tier_name TEXT,
  base_salary NUMERIC(12,2) DEFAULT 0,
  upsell_amount NUMERIC(12,2) DEFAULT 0,
  commission NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ผู้ใช้ระบบ (login + role)
CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  display_name TEXT,
  qc_admin_id UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS line_user_id TEXT;

-- Phase 3: qc_scores เพิ่ม columns สำหรับ SOP/coaching/commission แบบเต็ม
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS matched_sop_topic TEXT;
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS expected_sop_answer TEXT;
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS minor_issues JSONB DEFAULT '[]';
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS commission_tier JSONB;
ALTER TABLE sop_scripts ADD COLUMN IF NOT EXISTS used_count INT DEFAULT 0;

-- ============================================================
-- Scraper (Production) — messages/qc_scores เพิ่ม metadata + unique indexes กันซ้ำ
-- ============================================================
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_hash   TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source         TEXT;       -- 'scraper' | 'webhook' | 'admin_console'
ALTER TABLE messages ADD COLUMN IF NOT EXISTS raw            JSONB;      -- raw payload จาก scraper (debug/audit)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS admin_name     TEXT;       -- ชื่อ admin ที่ scraper ดึงมา (ก่อน resolve เป็น admin_id)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_group_id TEXT;       -- รวม bubble admin ที่ตอบติดกันเป็นกลุ่มเดียว
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type   TEXT DEFAULT 'text'; -- text/image/sticker/file/media/system

ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS source          TEXT;     -- 'scraper' | 'admin_console'
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS scraper_job_id  UUID;     -- job ที่ทำให้เกิดคะแนนนี้

-- unique indexes ป้องกัน insert ข้อความ/คู่ QC ซ้ำ (partial — เฉพาะแถวที่มี hash)
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_dedup
  ON messages (line_user_id, direction, message_hash, created_at)
  WHERE message_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reply_group ON messages (reply_group_id);
CREATE INDEX IF NOT EXISTS idx_qc_scores_job ON qc_scores (scraper_job_id);

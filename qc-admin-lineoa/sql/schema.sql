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

-- messages: เชื่อม job + สถานะ "ลูกค้ารอตอบ" (customer-only ที่ยังไม่มีแอดมินตอบ)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS scraper_job_id UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pending_reply  BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_messages_hash ON messages (conversation_id, message_hash);

-- conversations: meta การเก็บข้อมูลของ scraper
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS source              TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_scraped_at     TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_scraper_job_id UUID;

-- external_chat_key: ตัวระบุแชทที่คงที่ เมื่อไม่มี LINE user id (เก็บทุกแชทได้)
ALTER TABLE line_customers ADD COLUMN IF NOT EXISTS external_chat_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_line_customers_extkey
  ON line_customers (external_chat_key) WHERE external_chat_key IS NOT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS external_chat_key TEXT;

-- scraper_jobs: counters แบบ JSONB + mode (strict = ปกติ / deep_history = backfill)
ALTER TABLE scraper_jobs ADD COLUMN IF NOT EXISTS counters JSONB DEFAULT '{}'::jsonb;
ALTER TABLE scraper_jobs ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'strict';

-- scraper_chat_results: ผลเก็บข้อมูลต่อแชท (audit + counters ต่อห้อง)
CREATE TABLE IF NOT EXISTS scraper_chat_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper_job_id UUID, conversation_id UUID, line_user_id TEXT, external_chat_key TEXT,
  target_date_from DATE, target_date_to DATE,
  messages_found INTEGER DEFAULT 0, messages_inserted INTEGER DEFAULT 0,
  customer_messages INTEGER DEFAULT 0, admin_messages INTEGER DEFAULT 0,
  system_messages INTEGER DEFAULT 0, qc_pairs_created INTEGER DEFAULT 0,
  pending_reply_count INTEGER DEFAULT 0, pending_reply_messages INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ok', error_text TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE scraper_chat_results ADD COLUMN IF NOT EXISTS external_chat_key TEXT;
ALTER TABLE scraper_chat_results ADD COLUMN IF NOT EXISTS pending_reply_messages INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_scraper_chat_results_job ON scraper_chat_results (scraper_job_id);

-- unique indexes ป้องกัน insert ข้อความ/คู่ QC ซ้ำ (partial — เฉพาะแถวที่มี hash)
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_dedup
  ON messages (line_user_id, direction, message_hash, created_at)
  WHERE message_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reply_group ON messages (reply_group_id);
CREATE INDEX IF NOT EXISTS idx_qc_scores_job ON qc_scores (scraper_job_id);

-- performance indexes (dashboard date-filter + joins บน messages/qc_scores/customer_events)
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);
CREATE INDEX IF NOT EXISTS idx_messages_admin_id ON messages (admin_id);
CREATE INDEX IF NOT EXISTS idx_messages_dir_created ON messages (direction, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_lineuser ON messages (line_user_id);
CREATE INDEX IF NOT EXISTS idx_qc_scores_created_at ON qc_scores (created_at);
CREATE INDEX IF NOT EXISTS idx_qc_scores_admin_msg ON qc_scores (admin_message_id);
CREATE INDEX IF NOT EXISTS idx_qc_scores_admin_id ON qc_scores (admin_id);
CREATE INDEX IF NOT EXISTS idx_customer_events_created ON customer_events (created_at);
CREATE INDEX IF NOT EXISTS idx_customer_events_type_created ON customer_events (event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_events_admin_meta ON customer_events ((metadata->>'admin_id'));
CREATE INDEX IF NOT EXISTS idx_qc_score_details_code ON qc_score_details (category_code);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_lineuser ON conversations (line_user_id);

-- ============================================================
-- RBAC: roles / permissions / role_permissions / registration / audit (+ app_users cols)
-- (seed จริงทำที่ POST /api/auth/setup)
-- ============================================================
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS linked_admin_id UUID;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key TEXT UNIQUE NOT NULL, role_name TEXT NOT NULL, description TEXT,
  is_system BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key TEXT UNIQUE NOT NULL, permission_name TEXT, description TEXT, module TEXT);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_key TEXT NOT NULL, permission_key TEXT NOT NULL, PRIMARY KEY(role_key, permission_key));
CREATE TABLE IF NOT EXISTS user_registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL, password_hash TEXT NOT NULL, display_name TEXT, email TEXT,
  requested_role TEXT, linked_admin_name TEXT, note TEXT,
  status TEXT DEFAULT 'pending', reviewed_by TEXT, reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS user_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id TEXT, target_user_id TEXT, action TEXT, detail JSONB, created_at TIMESTAMPTZ DEFAULT now());

-- ---- RBAC seed: roles ----
INSERT INTO roles (role_key, role_name, description, is_system) VALUES
  ('system_admin','System Admin','สิทธิ์เต็มทั้งระบบ', true),
  ('manager','Manager','ดูภาพรวมทีม/QC/dispute/SOP/commission team', true),
  ('leader','Leader','ดูทีมย่อย/leaderboard/chat review/dispute review', true),
  ('admin','Admin (QC Operator)','ดูผลงานตัวเอง/chat own/commission own/ตอบลูกค้า', true),
  ('marketing','Marketing','ดูข้อมูลการตลาด (สมัคร/KYC/ฝากถอน/โปรโมชัน)', true)
ON CONFLICT (role_key) DO UPDATE SET role_name=EXCLUDED.role_name, is_system=EXCLUDED.is_system;

-- ---- RBAC seed: permissions (36) ----
INSERT INTO permissions (permission_key, module) VALUES
  ('dashboard.executive.view','dashboard'),('dashboard.admin.view','dashboard'),
  ('dashboard.manager.view','dashboard'),('dashboard.leaderboard.view','dashboard'),
  ('dashboard.marketing.view','dashboard'),
  ('chat.view.all','chat'),('chat.view.own','chat'),('chat.reply','chat'),('chat.review','chat'),
  ('qc.monitor.view','qc'),('qc.score.view','qc'),('qc.score.override','qc'),
  ('qc.dispute.create','qc'),('qc.dispute.review','qc'),
  ('sop.view','sop'),('sop.create','sop'),('sop.update','sop'),('sop.delete','sop'),('sop.import','sop'),
  ('scraper.view','scraper'),('scraper.run','scraper'),('scraper.schedule','scraper'),('scraper.report','scraper'),
  ('system.users.view','system'),('system.users.create','system'),('system.users.update','system'),
  ('system.users.disable','system'),('system.roles.manage','system'),('system.settings.manage','system'),
  ('system.events.manage','system'),
  ('commission.view.own','commission'),('commission.view.team','commission'),
  ('commission.view.all','commission'),('commission.adjust','commission'),
  ('marketing.dashboard.view','marketing'),('marketing.events.view','marketing')
ON CONFLICT (permission_key) DO NOTHING;

-- ---- RBAC seed: role_permissions ----
-- system_admin = ทุก permission
INSERT INTO role_permissions (role_key, permission_key)
  SELECT 'system_admin', permission_key FROM permissions
ON CONFLICT DO NOTHING;
-- admin (6)
INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('admin','dashboard.admin.view'),('admin','chat.view.own'),('admin','chat.reply'),
  ('admin','qc.score.view'),('admin','qc.dispute.create'),('admin','commission.view.own')
ON CONFLICT DO NOTHING;
-- manager (17)
INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('manager','dashboard.executive.view'),('manager','dashboard.manager.view'),
  ('manager','dashboard.leaderboard.view'),('manager','dashboard.marketing.view'),
  ('manager','qc.monitor.view'),('manager','qc.score.view'),('manager','qc.score.override'),
  ('manager','qc.dispute.review'),('manager','chat.view.all'),('manager','chat.review'),
  ('manager','sop.view'),('manager','sop.update'),('manager','scraper.view'),('manager','scraper.report'),
  ('manager','commission.view.team'),('manager','marketing.dashboard.view'),('manager','marketing.events.view')
ON CONFLICT DO NOTHING;
-- leader (8)
INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('leader','dashboard.manager.view'),('leader','dashboard.leaderboard.view'),
  ('leader','chat.view.all'),('leader','chat.review'),('leader','qc.monitor.view'),
  ('leader','qc.score.view'),('leader','qc.dispute.review'),('leader','commission.view.team')
ON CONFLICT DO NOTHING;
-- marketing (4)
INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('marketing','dashboard.marketing.view'),('marketing','marketing.dashboard.view'),
  ('marketing','marketing.events.view'),('marketing','commission.view.all')
ON CONFLICT DO NOTHING;
-- rev: 2026-06-19 file-integrity (LF, multi-line verified)

-- ============================================================
-- UAT feedback: AI review queue + case evidence + SOP training fields
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_score_id UUID, conversation_id UUID, message_id UUID,
  customer_name TEXT, admin_name TEXT, customer_text TEXT, admin_text TEXT,
  detected_intent TEXT, intent_confidence NUMERIC,
  matched_sop_id INTEGER, sop_confidence NUMERIC,
  reason TEXT, status TEXT DEFAULT 'pending',
  reviewed_by UUID, review_action TEXT, corrected_intent TEXT, corrected_sop_id INTEGER,
  reviewer_note TEXT, created_at TIMESTAMPTZ DEFAULT now(), reviewed_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS idx_ai_review_status ON ai_review_queue (status, created_at DESC);

CREATE TABLE IF NOT EXISTS case_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_score_id UUID, conversation_id UUID, scraper_job_id UUID,
  evidence_type TEXT, title TEXT, file_path TEXT, url TEXT,
  data JSONB, created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_case_evidence_qc ON case_evidence (qc_score_id);
CREATE INDEX IF NOT EXISTS idx_case_evidence_conv ON case_evidence (conversation_id);

ALTER TABLE sop_scripts ADD COLUMN IF NOT EXISTS knowledge_type TEXT;
ALTER TABLE sop_scripts ADD COLUMN IF NOT EXISTS example_questions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE sop_scripts ADD COLUMN IF NOT EXISTS source_case_id UUID;
ALTER TABLE sop_scripts ADD COLUMN IF NOT EXISTS training_status TEXT DEFAULT 'active';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source TEXT;

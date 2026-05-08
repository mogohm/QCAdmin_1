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

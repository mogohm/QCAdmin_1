-- Migration v3: SOP knowledge base + intent + fatal rules + QC upgrade columns
-- ปลอดภัยต่อข้อมูลเดิม: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS เท่านั้น

-- ---- หมวด SOP ----
CREATE TABLE IF NOT EXISTS sop_categories (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,        -- intent key เช่น deposit, withdraw
  name TEXT NOT NULL,               -- ชื่อหมวด (ไทย)
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---- สคริปต์/คำตอบมาตรฐาน (1 แถวต่อ 1 แนวคำถามใน Excel) ----
CREATE TABLE IF NOT EXISTS sop_scripts (
  id SERIAL PRIMARY KEY,
  category_code TEXT,                       -- = sop_categories.code (intent)
  topic TEXT NOT NULL,                       -- แนวคำถาม
  question TEXT,                             -- แนวคำถาม (normalize)
  answer TEXT NOT NULL,                      -- รายละเอียดคำตอบ (SOP จริง)
  intent TEXT,                               -- intent ที่ตรวจได้
  keywords JSONB NOT NULL DEFAULT '[]',      -- คำสำคัญสำหรับ match คำถามลูกค้า
  required_keywords JSONB NOT NULL DEFAULT '[]',   -- คำที่คำตอบที่ถูกต้องควรมี
  forbidden_keywords JSONB NOT NULL DEFAULT '[]',  -- คำที่ห้ามมีในคำตอบ
  escalation BOOLEAN DEFAULT false,          -- ต้อง escalate (เช่นให้ติดต่อ Live chat)
  source_sheet TEXT,
  source_row INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(topic)
);
CREATE INDEX IF NOT EXISTS idx_sop_scripts_intent ON sop_scripts(intent);
CREATE INDEX IF NOT EXISTS idx_sop_scripts_category ON sop_scripts(category_code);

-- ---- รูปแบบคำที่บ่งบอก intent (รองรับ ไทย/อังกฤษ/ผสม) ----
CREATE TABLE IF NOT EXISTS intent_patterns (
  id SERIAL PRIMARY KEY,
  intent TEXT NOT NULL,
  pattern TEXT NOT NULL,             -- keyword/วลี (lowercase)
  lang TEXT DEFAULT 'th',            -- th / en / mixed
  weight NUMERIC(5,2) DEFAULT 1,
  UNIQUE(intent, pattern)
);
CREATE INDEX IF NOT EXISTS idx_intent_patterns_intent ON intent_patterns(intent);

-- ---- กฎร้ายแรง (ละเมิด = score 0) ----
CREATE TABLE IF NOT EXISTS fatal_rules (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  patterns JSONB NOT NULL DEFAULT '[]',   -- วลีต้องห้าม (เจอใน admin reply = fatal)
  applies_to TEXT,                        -- intent ที่ใช้ (null = ทุก intent)
  severity TEXT DEFAULT 'fatal',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---- อัปเกรด qc_scores: เก็บผลแบบ 8 มิติ + intent + SOP + coaching ----
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS intent TEXT;
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS matched_sop_id INT;
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS sop_confidence INT;
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS dimension_scores JSONB DEFAULT '{}';
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS is_fatal BOOLEAN DEFAULT false;
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS fatal_reasons JSONB DEFAULT '[]';
ALTER TABLE qc_scores ADD COLUMN IF NOT EXISTS coaching JSONB;

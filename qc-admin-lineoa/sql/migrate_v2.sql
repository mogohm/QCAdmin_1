-- Migration v2: เพิ่ม assigned_admin, phone, email ใน line_customers
--              เพิ่ม message_type ใน messages

ALTER TABLE line_customers
  ADD COLUMN IF NOT EXISTS assigned_admin TEXT,
  ADD COLUMN IF NOT EXISTS phone          TEXT,
  ADD COLUMN IF NOT EXISTS email          TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';

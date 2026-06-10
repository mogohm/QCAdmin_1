// db:migrate — รัน sql/schema.sql ทั้งไฟล์ (idempotent: CREATE/ALTER IF NOT EXISTS)
// ใช้ DATABASE_URL จาก env
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

(async () => {
  if (!process.env.DATABASE_URL) { console.error('❌ ต้องตั้ง DATABASE_URL'); process.exit(1); }
  const db = neon(process.env.DATABASE_URL);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  const parts = sql.split(/;\s*\n/).map(x => x.trim()).filter(Boolean);
  let ok = 0, skip = 0;
  for (const part of parts) {
    try { await db(part); ok++; }
    catch (e) { if (/already exists|duplicate/i.test(e.message)) skip++; else { console.error('⚠️', e.message.slice(0, 90)); skip++; } }
  }
  console.log(`✅ migrate เสร็จ: รัน ${ok} statements (ข้าม/มีอยู่แล้ว ${skip})`);
})();

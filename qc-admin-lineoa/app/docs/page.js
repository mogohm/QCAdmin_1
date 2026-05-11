export default function Docs() {
  const code = (s) => <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}>{s}</code>;
  const pre = (s) => (
    <pre style={{ background: '#1e293b', color: '#e2e8f0', borderRadius: 8, padding: '14px 16px', overflowX: 'auto', fontSize: 13, lineHeight: 1.6, margin: '8px 0 0' }}>
      {s}
    </pre>
  );

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">QC<span>Admin</span></div>
        <nav className="nav">
          <a href="/">Dashboard</a>
          <a href="/admin">Admin Console</a>
          <a href="/scraper">Scraper</a>
          <a href="/rules">⚙️ QC Rules</a>
          <a className="active" href="/docs">Setup Docs</a>
        </nav>
      </aside>

      <main className="main">
        <article className="card" style={{ maxWidth: 820, lineHeight: 1.8 }}>
          <h1 style={{ marginTop: 0 }}>คู่มือติดตั้งและใช้งาน QC Admin</h1>
          <p style={{ color: '#6b7280', marginTop: -8 }}>อัปเดตล่าสุด พฤษภาคม 2026</p>

          {/* Architecture */}
          <h2>🏗️ ภาพรวมระบบ</h2>
          <p>ระบบมี 2 ช่องทางในการรับข้อมูลการตอบของ Admin:</p>
          <ol>
            <li><b>Scraper (แนะนำ)</b> — Playwright bot ดึงประวัติแชทจาก <b>chat.line.biz</b> โดยตรง รันบนเครื่อง Windows ของทีม ทำงานอัตโนมัติตามรอบเวลา ไม่ต้องเปลี่ยน workflow ของ Admin</li>
            <li><b>Admin Console</b> — Admin ตอบผ่านหน้า /admin ของระบบ ระบบส่งผ่าน LINE Push API และบันทึก QC ทันที (ใช้กรณีต้องการข้อมูลแบบ real-time)</li>
          </ol>
          <p style={{ color: '#6b7280' }}>LINE webhook บันทึกข้อความฝั่งลูกค้าเท่านั้น ข้อความที่ Admin ตอบจาก LINE OA Manager โดยตรงไม่ถูกส่งกลับเป็น webhook → ต้องใช้ Scraper ดึงออกมา</p>

          {/* Deploy */}
          <h2>1. Deploy บน Vercel + Neon Postgres</h2>
          <ol>
            <li>Push โฟลเดอร์ {code('qc-admin-lineoa')} ขึ้น GitHub</li>
            <li>เข้า <b>Vercel</b> → Add New Project → import repo</li>
            <li>ติดตั้ง <b>Neon Postgres</b> จาก Vercel Marketplace แล้วผูกกับ project</li>
            <li>ตั้ง Environment Variables:</li>
          </ol>
          {pre(`DATABASE_URL=postgres://...              # จาก Neon (ใส่ให้ครบ)
LINE_CHANNEL_SECRET=abc123...          # จาก LINE Developers Console
LINE_CHANNEL_ACCESS_TOKEN=Bearer ...   # จาก LINE Developers Console
ADMIN_API_KEY=YOUR_SECRET_KEY          # กำหนดเองใช้สำหรับ scraper + admin page
TELEGRAM_BOT_TOKEN=123:ABC...          # (optional) แจ้งเตือน QC fail
TELEGRAM_CHAT_ID=-100...               # (optional)`)}
          <ol start={5}>
            <li>Deploy แล้วรัน SQL ใน Neon SQL Editor:</li>
          </ol>
          {pre(`-- วิ่งครั้งเดียวตอน setup
-- คัดลอกจาก sql/schema.sql แล้ว paste ใน Neon console`)}

          {/* LINE Webhook */}
          <h2>2. ตั้งค่า LINE Webhook</h2>
          <ol>
            <li>เข้า <a href="https://developers.line.biz" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>LINE Developers Console</a> → เลือก Channel</li>
            <li>เปิด <b>Messaging API</b> แล้วคัดลอก Channel secret และ Channel access token</li>
            <li>ตั้ง Webhook URL: {code('https://YOUR_DOMAIN/api/webhook')}</li>
            <li>กด <b>Verify</b> แล้วเปิด <b>Use webhook</b></li>
          </ol>

          {/* Scraper */}
          <h2>3. ตั้งค่าและรัน Scraper</h2>
          <p>Scraper อยู่ในโฟลเดอร์ {code('qc-scraper/')} รันบนเครื่อง Windows ที่มี Node.js</p>

          <h3 style={{ fontSize: 15 }}>3.1 ติดตั้ง</h3>
          {pre(`cd qc-scraper
npm install
npx playwright install chromium`)}

          <h3 style={{ fontSize: 15 }}>3.2 ตั้งค่า .env</h3>
          {pre(`QC_API_URL=https://YOUR_DOMAIN
QC_API_KEY=YOUR_SECRET_KEY          # ต้องตรงกับ ADMIN_API_KEY บน Vercel

SCHEDULE_MINUTES=30                  # รัน auto ทุก 30 นาที (0 = รอ job จาก /scraper)
MIN_IDLE_MINUTES=30                  # ข้ามแชทที่ admin ตอบล่าสุดน้อยกว่า 30 นาที`)}

          <h3 style={{ fontSize: 15 }}>3.3 Login LINE OA ครั้งแรก</h3>
          {pre(`node login.js    # เปิด browser ให้ login LINE OA Manager แล้ว Enter`)}

          <h3 style={{ fontSize: 15 }}>3.4 รัน Scraper</h3>
          {pre(`# วิธีง่าย — ดับเบิ้ลคลิก
start.bat

# รันผ่าน terminal
node scraper.js                      # headless, วันนี้
node scraper.js --headed             # มีหน้าต่าง browser (debug)
node scraper.js --yesterday          # ดึงข้อมูลเมื่อวาน
node scraper.js --date=2026-05-01    # ดึงวันที่ระบุ`)}

          <p><b>MIN_IDLE_MINUTES</b>: scraper จะข้ามแชทที่ admin ตอบล่าสุดน้อยกว่าค่านี้ (ป้องกัน interrupt admin ที่กำลังทำงาน)</p>

          {/* Import Admin */}
          <h2>4. Import Admin จาก LINE OA Manager</h2>
          <ol>
            <li>เข้า LINE OA Manager → Settings → Manage permissions</li>
            <li>คัดลอกชื่อ Member ทั้งหมด</li>
            <li>เปิด {code('/admin')} แล้ววางชื่อในช่อง Import Admin</li>
            <li>ระบบจะรับชื่อที่ขึ้นต้น <b>PK</b> เช่น {code('PK May 🌟')}, {code('PK - Duk')}</li>
          </ol>
          <p style={{ color: '#6b7280' }}>Scraper จะสร้าง Admin ใหม่อัตโนมัติถ้าพบชื่อที่ไม่มีในระบบ</p>

          {/* QC Rules */}
          <h2>5. จัดการ QC Rules</h2>
          <p>เข้า {code('/rules')} เพื่อเพิ่ม/แก้ไข/ลบ rules ผ่าน UI ต้องกรอก Admin API Key ก่อนแก้ไข</p>
          <p>แต่ละ Rule ประกอบด้วย:</p>
          <ul>
            <li><b>Rule Code</b>: รหัส unique เช่น {code('DEP-002')}</li>
            <li><b>Category</b>: register / kyc / deposit / promotion / other</li>
            <li><b>Question Keywords</b>: คำที่ลูกค้าถาม เช่น "ฝาก, โอน, เติมเงิน"</li>
            <li><b>Answer Keywords</b>: คำที่ Admin ควรตอบ เช่น "QR, สลิป, ตรวจสอบ"</li>
            <li><b>Weight</b>: น้ำหนักคะแนน (0.1–5)</li>
          </ul>
          <p>หรือใช้ API โดยตรง:</p>
          {pre(`# ดู rules ทั้งหมด
GET /api/config/rules

# เพิ่ม/อัปเดต rule (upsert by rule_code)
POST /api/config/rules
{ "rule_code": "DEP-002", "rule_name": "แจ้ง QR ฝากเงิน",
  "category": "deposit", "question_keywords": ["QR","qrcode"],
  "answer_keywords": ["QR","สแกน"], "weight": 1.5 }

# แก้ไข rule เดี่ยว
PATCH /api/config/rules/:id
{ "is_active": false }

# ลบ rule
DELETE /api/config/rules/:id`)}

          {/* Customer Profile */}
          <h2>6. หน้า Customer Profile</h2>
          <p>คลิกชื่อลูกค้าในตาราง Reply Log จะไปที่ {code('/customer/[line_user_id]')} แสดง:</p>
          <ul>
            <li>สถานะ: สมัคร, KYC, ยอดเติมรวม</li>
            <li>Stats: จำนวน conversations, QC score เฉลี่ย, เวลาตอบเฉลี่ย</li>
            <li>Event Timeline: register, KYC, deposit ทุกรายการ</li>
            <li>รายการ Conversations พร้อมคะแนน QC แต่ละครั้ง</li>
            <li>ปุ่มดูแชท (เปิด Chat Modal)</li>
          </ul>

          {/* Customer Events API */}
          <h2>7. API รับ Event จากระบบภายนอก</h2>
          <p>ระบบหลังบ้าน (สมัคร/KYC/เติมเงิน) ยิง POST มาที่ {code('/api/customer-event')}:</p>
          {pre(`curl -X POST https://YOUR_DOMAIN/api/customer-event \\
  -H "Content-Type: application/json" -H "x-api-key: YOUR_KEY" \\
  -d '{
    "line_user_id": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "event_type": "deposit",
    "status": "pass",
    "amount": 500,
    "promotion_code": "PROMO-A"
  }'

# event_type: register | kyc | deposit | withdrawal`)}

          {/* Daily workflow */}
          <h2>8. การใช้งานรายวัน</h2>
          <ol>
            <li>Scraper รันอัตโนมัติทุก 30 นาที (ตาม SCHEDULE_MINUTES) — ไม่ต้องทำอะไร</li>
            <li>เปิด Dashboard ดู KPI, Ranking admin, Reply log</li>
            <li>คลิกชื่อลูกค้าเพื่อดู Profile และประวัติทั้งหมด</li>
            <li>คลิก 💬 เพื่อดูบทสนทนาพร้อม QC score breakdown</li>
            <li>ถ้า score ต่ำกว่า 70 จะมีแจ้งเตือน Telegram (ถ้าตั้งค่าไว้)</li>
            <li>จัดการ QC Rules ได้ที่ {code('/rules')} ไม่ต้องแก้ DB โดยตรง</li>
          </ol>

          {/* SLA settings */}
          <h2>9. ปรับเกณฑ์ SLA</h2>
          <p>เวลาตอบที่ยอมรับได้ตั้งใน {code('app_settings')} key = {code('response_limit_minutes')} (default: 5 นาที)</p>
          {pre(`-- ปรับ SLA เป็น 3 นาที
UPDATE app_settings SET value = '3' WHERE key = 'response_limit_minutes';`)}

          {/* ENV summary */}
          <h2>📋 สรุป Environment Variables</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Key</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>ที่ใช้</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>จำเป็น</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['DATABASE_URL', 'Neon Postgres connection string', '✅'],
                ['LINE_CHANNEL_SECRET', 'verify webhook signature', '✅'],
                ['LINE_CHANNEL_ACCESS_TOKEN', 'ส่งข้อความผ่าน Push API', '✅'],
                ['ADMIN_API_KEY', 'auth สำหรับ scraper / rules API', '✅'],
                ['TELEGRAM_BOT_TOKEN', 'แจ้งเตือน QC fail', '—'],
                ['TELEGRAM_CHAT_ID', 'แจ้งเตือน QC fail', '—'],
              ].map(([k, d, r], i) => (
                <tr key={i} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{k}</td>
                  <td style={{ padding: '8px 12px', color: '#374151' }}>{d}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>{r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </main>
    </div>
  );
}

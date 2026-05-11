# QC Admin LINE OA

ระบบ Quality Control สำหรับ LINE Official Account — วัดคุณภาพการตอบของ Admin แบบ near real-time

**Stack:** Next.js 15 · Neon Postgres · Vercel · Playwright (scraper)

---

## Features

| ฟีเจอร์ | รายละเอียด |
|---|---|
| **Scraper** | Playwright bot ดึงประวัติแชทจาก chat.line.biz อัตโนมัติทุก N นาที |
| **QC Engine** | ประเมิน response time, correctness (keyword rules), sentiment, bot-like penalty |
| **Dashboard** | KPI cards, Admin ranking, daily summary, reply log พร้อมกรองวันที่ |
| **Customer Profile** | คลิกชื่อลูกค้า → ดูประวัติ events, conversations, QC stats |
| **QC Rules UI** | เพิ่ม/แก้ไข/ลบ knowledge rules ผ่านหน้าเว็บ (/rules) |
| **Chat Modal** | คลิกดูบทสนทนาพร้อม QC score breakdown รายข้อความ |
| **LINE Webhook** | รับข้อความลูกค้า, upsert line_customers |
| **Admin Console** | ตอบลูกค้าผ่าน LINE Push API เพื่อบันทึก QC real-time |
| **Admin Import** | import จาก Manage permissions — รับชื่อขึ้นต้น PK |
| **Customer Events API** | รับ event register/kyc/deposit จากระบบภายนอก |
| **Telegram Alert** | แจ้งเตือนเมื่อ QC score < 70 |

---

## Quick Start

### 1. Deploy (Vercel + Neon)

```bash
# 1. push qc-admin-lineoa/ ขึ้น GitHub แล้ว import ใน Vercel
# 2. ติดตั้ง Neon Postgres จาก Vercel Marketplace
# 3. รัน sql/schema.sql ใน Neon SQL Editor
```

**Environment Variables (Vercel):**

```
DATABASE_URL=postgres://...
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
ADMIN_API_KEY=your_secret_key
TELEGRAM_BOT_TOKEN=...        # optional
TELEGRAM_CHAT_ID=...          # optional
```

**LINE Webhook:** ตั้ง `https://YOUR_DOMAIN/api/webhook` ใน LINE Developers Console

### 2. Setup Scraper (Windows)

```bash
cd qc-scraper
npm install
npx playwright install chromium

# ตั้งค่า .env
QC_API_URL=https://YOUR_DOMAIN
QC_API_KEY=your_secret_key
SCHEDULE_MINUTES=30      # auto-run ทุก 30 นาที
MIN_IDLE_MINUTES=30      # ข้ามแชทที่ admin ตอบล่าสุดน้อยกว่า 30 นาที

# Login LINE OA ครั้งแรก
node login.js

# รัน (ดับเบิ้ลคลิก start.bat หรือ)
node scraper.js
node scraper.js --headed      # debug mode (มีหน้าต่าง)
node scraper.js --yesterday   # ดึงข้อมูลเมื่อวาน
node scraper.js --date=YYYY-MM-DD
```

---

## Pages

| URL | หน้า |
|---|---|
| `/` | Dashboard (KPI, ranking, reply log) |
| `/rules` | จัดการ QC Rules |
| `/customer/[id]` | Customer profile |
| `/scraper` | ควบคุม scraper jobs |
| `/admin` | Admin Console |
| `/docs` | คู่มือติดตั้ง |

## API Endpoints

| Method | Endpoint | รายละเอียด |
|---|---|---|
| GET | `/api/dashboard` | KPI, ranking, reply log |
| GET | `/api/config/rules` | ดู QC rules ทั้งหมด |
| POST | `/api/config/rules` | เพิ่ม/อัปเดต rule |
| PATCH | `/api/config/rules/:id` | แก้ไข rule เดี่ยว |
| DELETE | `/api/config/rules/:id` | ลบ rule |
| GET | `/api/customer/:line_user_id` | ข้อมูลลูกค้าครบ (events, conversations, stats) |
| GET | `/api/chat/:line_user_id` | บทสนทนาพร้อม QC scores |
| POST | `/api/customer-event` | บันทึก event จากระบบภายนอก |
| POST | `/api/admin/log-reply` | scraper ส่งข้อมูลการตอบ + คำนวณ QC |
| POST | `/api/webhook` | LINE webhook |
| GET | `/api/health` | ตรวจสอบระบบ |

---

## Production Note

LINE webhook บันทึกเฉพาะข้อความฝั่งลูกค้า ข้อความที่ Admin ตอบจาก LINE OA Manager โดยตรงไม่ถูกส่งกลับเป็น webhook **→ ต้องใช้ Scraper ดึงออกมา** หรือให้ Admin ตอบผ่าน `/admin`

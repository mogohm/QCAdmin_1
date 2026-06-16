# QCAdmin_1 — Deployment Guide

ระบบ LINE OA QC: **Next.js (qc-admin-lineoa/)** + **Neon Postgres** + **Playwright scraper (qc-scraper/)** → deploy บน **Vercel**
Production: https://qc-admin-1.vercel.app

---

## 1. Environment Variables

ตั้งค่าใน **Vercel → Project → Settings → Environment Variables** (Production + Preview)

| ตัวแปร | จำเป็น | ใช้ทำอะไร |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon Postgres connection string (`postgres://…?sslmode=require`) |
| `ADMIN_API_KEY` | ✅ | auth ของ scraper + admin endpoints + guard ของ read API (เช่น `PKQC2026SUPERADMIN`) |
| `SESSION_SECRET` | แนะนำ | ใช้เซ็น session cookie (ถ้าไม่ตั้ง จะ fallback ไป `ADMIN_API_KEY`) |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅* | ส่งข้อความตอบกลับ + ดึงโปรไฟล์ลูกค้า (*ต้องมีถ้าใช้ reply/webhook) |
| `LINE_CHANNEL_SECRET` | ✅* | ตรวจ signature ของ LINE webhook |
| `TELEGRAM_BOT_TOKEN` | ทางเลือก | แจ้งเตือน QC fail/fatal/dispute (ถ้าไม่ตั้ง = ปิดเงียบ) |
| `TELEGRAM_CHAT_ID` | ทางเลือก | ปลายทางแจ้งเตือน Telegram |
| `APP_BASE_URL` | แนะนำ | ใช้สร้างลิงก์ในข้อความ Telegram (default `https://qc-admin-1.vercel.app`) |
| `QC_RESPONSE_LIMIT_MINUTES` | ทางเลือก | เกณฑ์ SLA response time (default 5 นาที; override ได้ที่ตาราง `app_settings`) |

> ⚠️ **ห้าม** commit ค่าจริงของตัวแปรเหล่านี้ลง git และห้าม commit `qc-scraper/auth.json` (มี session token ของ LINE OA)

---

## 2. ขั้นตอน Deploy ครั้งแรก

```bash
# 2.1 ตั้ง DATABASE_URL ใน shell แล้วสร้าง schema (15 ตาราง + app_users)
cd qc-admin-lineoa
DATABASE_URL="postgres://…" npm run db:init

# 2.2 import SOP จาก Excel เข้า DB (sop_scripts, sop_categories, intent_patterns, fatal_rules)
#     ทำผ่าน endpoint หลัง deploy:
curl -X POST https://qc-admin-1.vercel.app/api/admin/import-sop -H "x-api-key: $ADMIN_API_KEY"
#     หรือ local: DATABASE_URL=… npm run import:sop

# 2.3 seed บัญชีผู้ใช้ (manager/marketing + admin ทุก PK)
curl -X POST https://qc-admin-1.vercel.app/api/auth/setup -H "x-api-key: $ADMIN_API_KEY"
#     → manager/manager123, marketing/marketing123, <admin-slug>/pk1234
#     ⚠️ เปลี่ยนรหัสผ่าน default ก่อนใช้งานจริง

# 2.4 push ขึ้น git → Vercel auto-deploy
git push origin main
```

---

## 3. LINE Webhook

- ตั้ง Webhook URL ใน LINE Developers Console:
  `https://qc-admin-1.vercel.app/api/webhook`
- เปิด "Use webhook" และใส่ `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` ให้ตรงกับ Vercel env
- webhook ตรวจ signature ด้วย `LINE_CHANNEL_SECRET` (`lib/line.js → verifyLineSignature`)

---

## 4. Scraper (qc-scraper/)

- รันบนเครื่อง operator (Playwright) — login LINE OA Manager ครั้งเดียว เก็บ session ใน `auth.json` (ไม่ commit)
- ตั้ง env บนเครื่อง: `APP_BASE_URL` (ปลายทาง API) + `ADMIN_API_KEY` (ต้องตรงกับ Vercel)
- scraper เรียกเฉพาะ endpoint ที่ป้องกันด้วย api-key: `/api/scraper/poll`, `/api/scraper/job`, `/api/admin/log-reply`, `/api/customer/note`
- **Scheduler**: สแกนแบบสองเฟส (scan Yesterday zone ทั้งหมด → process จาก chat สุดท้าย) รันอัตโนมัติรายวัน, ไม่ relogin ทุกวัน (ใช้ session เดิมจนหมดอายุ)
- จังหวะการยิง: หน่วงระหว่าง chat เพื่อไม่ให้โดน LINE block

---

## 5. Build / Migration

```bash
npm run build          # Next.js production build (ต้องผ่านก่อน deploy)
npm run db:migrate     # ถ้ามี migration เพิ่ม (schema.sql เป็น idempotent: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
```

- `sql/schema.sql` รันซ้ำได้ปลอดภัย (CREATE/ALTER … IF NOT EXISTS) — ใช้เป็น source of truth ของ schema
- Neon: ใช้ `@neondatabase/serverless` (tagged-template `query` เท่านั้น — ห้ามส่ง string ตรง ๆ)

---

## 6. Post-deploy Smoke Test

```bash
# health
curl https://qc-admin-1.vercel.app/api/health
# dashboard (ต้องมี session/ api-key — คาดหวัง 401 ถ้าไม่มี key)
curl -H "x-api-key: $ADMIN_API_KEY" "https://qc-admin-1.vercel.app/api/dashboard?from=2026-06-01&to=2026-06-30"
# live test ครบชุด (รวม SOP CRUD)
ADMIN_API_KEY=$ADMIN_API_KEY npm run test:dashboard-api
```

ดู **UAT_CHECKLIST.md** สำหรับรายการตรวจรับก่อน go-live และ **OPERATION_MANUAL.md** สำหรับการใช้งานประจำวัน

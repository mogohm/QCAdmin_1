# QC Admin LINE OA

ระบบ **Quality Control** สำหรับ LINE Official Account — วัดคุณภาพการตอบของแอดมินด้วย **AI QC Engine v4** (SOP-driven) แบบ near real-time พร้อมระบบโต้แย้ง (dispute), ค่าคอมมิชชัน และ role-based dashboard

**Stack:** Next.js (App Router) · Neon Postgres · Vercel · Playwright (scraper) · Telegram alert
**Production:** https://qc-admin-1.vercel.app

---

## ภาพรวมระบบ (Pipeline)

```
Customer message ──► Admin reply (scraper / Admin Console)
        │
        ▼  runQc()  (lib/qc-runner.js)
   detectIntent ─► matchSOP ─► QC Engine v4 (8 มิติ) ─► qc_scores + qc_score_details
        │                                                      │
        ├─► sop_scripts.used_count++                           ├─► Telegram alert (fail/fatal)
        ▼                                                      ▼
   Dashboard / Chat Review ◄── อ่านจาก qc_score_details ── Dispute ─► Manager approve/reject ─► Commission
```

---

## Features

| ฟีเจอร์              | รายละเอียด                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **SOP Import**       | import SOP จาก Excel → `sop_scripts` (topic, keywords, required/forbidden keywords, intent, escalation) via `POST /api/admin/import-sop` |
| **QC Engine v4**     | rubric 8 มิติถ่วงน้ำหนักคงที่ + intent detection + SOP matching + evidence รายมิติ + minor/fatal + SLA exception                         |
| **Dispute**          | แอดมินโต้แย้งผล AI → Manager ตรวจ + แก้คะแนน (อัปเดต `qc_scores.final_score`)                                                            |
| **System Events**    | บันทึกช่วงระบบ/ธนาคารล่ม → ยกเว้น SLA response time ของเคสในช่วงนั้น                                                                     |
| **Commission**       | tier ตามคะแนน (Excellent ×1.2 / Standard ×1.0 / Warning ×0.5 / Critical ×0) → snapshot ลง `admin_commissions`                            |
| **Dashboard ใหม่**   | KPI ext 11 ตัว, QA trend, Category breakdown (จาก `qc_score_details`), SOP coverage, intent distribution, ranking, pending reply         |
| **Role-based Login** | session HMAC cookie — manager / marketing / admin (PK) แยกสิทธิ์                                                                         |
| **Scraper**          | Playwright สแกน LINE OA สองเฟส (scan Yesterday → process), auto-run รายวัน, ส่งผ่าน api-key                                              |
| **Telegram Alert**   | แจ้งเตือนเคส fail/fatal/dispute                                                                                                          |

---

## QC Engine v4 — Rubric

น้ำหนักคงที่ (มิติที่ไม่เกี่ยวกับ intent = **N/A** ไม่คิดในตัวหาร):

| มิติ                       | น้ำหนัก | applies            |
| -------------------------- | ------- | ------------------ |
| Greeting & Closing         | 15      | ทุก intent         |
| Problem Solving & Accuracy | 20      | ทุก intent         |
| Communication & Tone       | 20      | ทุก intent         |
| Response Time              | 10      | ทุก intent         |
| Upselling & Promotion      | 10      | promotion / bonus  |
| Credit Deposit/Withdraw    | 10      | deposit / withdraw |
| KYC Process                | 10      | kyc                |

- **Minor** (ไม่มีคำลงท้ายสุภาพ / ตอบสั้น / ส่งซ้ำ) → −5
- **Fatal** (หยาบคาย / โทษลูกค้า / รับประกันผลพนัน / ปฏิเสธช่วยเหลือ) → คะแนน = **0**
- **SLA exception**: มี System Event ครอบเวลา → response time floor 80
- **Calibration (มิ.ย. 2026):** `dimProblemSolving` ให้เครดิต required-keyword coverage + เนื้อหา ไม่ลงโทษการเรียบเรียงใหม่ที่ถูกต้อง → วัดด้วย `npm run test:qc-accuracy`

---

## Pages

| URL                  | หน้า                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| `/`                  | Executive Dashboard (KPI, trend, category, SOP coverage, commission) |
| `/qc-dashboard`      | QC Monitoring (คะแนนรายเคส)                                          |
| `/chat-review`       | Chat Review + QC breakdown รายข้อความ                                |
| `/sop`               | SOP Knowledge Base (ค้นหา/แก้ไข/soft-delete, used_count, coverage)   |
| `/disputes`          | Dispute Review (manager อนุมัติ/ปฏิเสธ + แก้คะแนน)                   |
| `/system-events`     | System Events (SLA exception)                                        |
| `/admin-performance` | Admin Performance (heatmap รายมิติ, ranking, coaching)               |
| `/commission`        | Commission (tier × upsell, override, export, save)                   |
| `/customer/[id]`     | Customer Profile                                                     |
| `/login`             | เข้าสู่ระบบ (role-based)                                             |

---

## API Endpoints (หลัก)

| Method   | Endpoint                                               | auth                  | รายละเอียด                                                    |
| -------- | ------------------------------------------------------ | --------------------- | ------------------------------------------------------------- |
| GET      | `/api/dashboard`                                       | session/key           | KPI ext, category (จาก qc_score_details), ranking, commission |
| GET/POST | `/api/sop` · `/api/sop/:id`                            | session/key           | ค้นหา/สร้าง/แก้ไข SOP · DELETE = soft (`?hard=true` ลบจริง)   |
| GET/POST | `/api/qc-disputes` · `/api/qc-disputes/:id`            | session/key · manager | list/create · PATCH approve/reject                            |
| GET/POST | `/api/system-events` · `/api/system-events/:id`        | session/key           | เหตุการณ์ระบบ + SLA                                           |
| GET/POST | `/api/commission`                                      | session/key           | list / save snapshot                                          |
| POST     | `/api/admin/reply`                                     | key                   | ตอบลูกค้า + runQc                                             |
| POST     | `/api/admin/log-reply`                                 | key                   | scraper ส่งการตอบ + runQc                                     |
| POST     | `/api/admin/import-sop`                                | key                   | import SOP จาก Excel                                          |
| POST     | `/api/auth/login` · `/api/auth/setup`                  | – · key               | login · seed บัญชี                                            |
| GET      | `/api/replies` · `/api/chat/:id` · `/api/customer/:id` | session/key           | (read ภายในแอป — guarded)                                     |
| POST     | `/api/webhook`                                         | LINE sig              | LINE webhook                                                  |

> read API ภายในทั้งหมด require **session หรือ `x-api-key`** (ดู `lib/guard.js`)

---

## Quick Start

```bash
cd qc-admin-lineoa
npm install

# 1) สร้าง schema (15 ตาราง + app_users) — ต้องตั้ง DATABASE_URL ก่อน
DATABASE_URL="postgres://…" npm run db:init

# 2) import SOP จาก Excel เข้า DB
DATABASE_URL="postgres://…" npm run import:sop
#   หรือหลัง deploy: curl -X POST <URL>/api/admin/import-sop -H "x-api-key: $ADMIN_API_KEY"

# 3) seed บัญชีผู้ใช้ (manager/marketing + admin ทุก PK)
curl -X POST <URL>/api/auth/setup -H "x-api-key: $ADMIN_API_KEY"
#   → manager/manager123, marketing/marketing123, <slug>/pk1234  (เปลี่ยนรหัสก่อนใช้จริง)

# 4) dev / build
npm run dev
npm run build
```

ดู **[docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)** · **[docs/UAT_CHECKLIST.md](../docs/UAT_CHECKLIST.md)** · **[docs/OPERATION_MANUAL.md](../docs/OPERATION_MANUAL.md)**

---

## Environment Variables

| Key                                       | จำเป็น | ใช้ทำอะไร                                          |
| ----------------------------------------- | ------ | -------------------------------------------------- |
| `DATABASE_URL`                            | ✅     | Neon Postgres                                      |
| `ADMIN_API_KEY`                           | ✅     | auth scraper/admin + guard read API                |
| `SESSION_SECRET`                          | แนะนำ  | เซ็น session cookie (fallback → ADMIN_API_KEY)     |
| `LINE_CHANNEL_ACCESS_TOKEN`               | ✅\*   | ส่งข้อความ + ดึงโปรไฟล์ลูกค้า                      |
| `LINE_CHANNEL_SECRET`                     | ✅\*   | verify webhook signature                           |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | –      | แจ้งเตือน QC (ปิดเงียบถ้าไม่ตั้ง)                  |
| `APP_BASE_URL`                            | แนะนำ  | ลิงก์ใน Telegram                                   |
| `QC_RESPONSE_LIMIT_MINUTES`               | –      | เกณฑ์ SLA (default 5, override ที่ `app_settings`) |

---

## Test Commands (ล่าสุด)

```bash
npm run build               # Next.js build (46 routes)
npm run test:qc             # QC engine ครบ (31 checks, offline)
npm run test:qc-accuracy    # ชุดเคสจริง 34 cases (intent + pass/fail/fatal)
npm run test:admin-import   # PK admin detection (32 checks)
npm run test:admin-reply    # runQc + qc_score_details insert (24 checks)
npm run test:dashboard-api  # /api/dashboard fields + SOP CRUD live (ตั้ง ADMIN_API_KEY)
npm run audit:sop           # คุณภาพข้อมูล SOP (DB หรือ offline)
npm run uat:check           # รวมทั้งหมด: build + tests + audit (ต้องมี ADMIN_API_KEY)
```

---

## Production Note

LINE webhook บันทึกเฉพาะข้อความฝั่งลูกค้า — ข้อความที่แอดมินตอบจาก LINE OA Manager โดยตรงไม่ถูกส่งกลับเป็น webhook **→ ต้องใช้ Scraper ดึงออกมา** (กรองเฉพาะชื่อแอดมินที่ขึ้นต้น **PK**) หรือให้แอดมินตอบผ่าน `/admin`

# Date Reconciliation Report — Canonical `case_at`

รายงานการ reconcile ตัวเลขจำนวนเคสของทุก module ที่นับเคส เทียบกับ **production DB จริง**
ตามนิยาม canonical `qc_scores.case_at` (P1 Data Correctness).

- **Environment:** production (`QC_API_URL` = `https://qc-admin-1.vercel.app`, Neon Postgres เดียวกับ Vercel)
- **วันที่ตรวจ (3 ประเภท):**
  1. `2026-07-12` — วัน scrape ปกติ (job done 519 ห้อง)
  2. `2026-07-06` — วัน scrape ย้อนหลัง (job aged-out จาก list แต่ data ครบ)
  3. `2026-07-08` — วันที่มี AI Review / manual / evidence (edge, ปริมาณต่ำ)
- **Commit:** `d44907c9` (reconcile-dates.js comprehensive + `/api/debug/date-reconcile`)
- **Date run:** 2026-07-15 (Asia/Bangkok)

## Command ที่รัน

```bash
# เทียบทุก module ต่อวัน (ยิง production DB จริงผ่าน API ที่ query DB)
node scripts/reconcile-dates.js --date=2026-07-12 --date=2026-07-06 --date=2026-07-08
# หรือ
npm run audit:date-reconcile -- --date=2026-07-12 --date=2026-07-06 --date=2026-07-08
```

แหล่งข้อมูล: `/api/debug/date-reconcile?date=` (นับตรงจาก DB) + `/api/dashboard` (scraperCoverage) + `/api/scraper/job` (job status).

## Summary table (production จริง)

| date | scraper_job | messages_total | customer | admin | qc_by_case_at | chat_review | dashboard_cases | dashboard_chats | ranking | commission | ai_review | evidence_exact | manual | disputes | mismatch_status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-07-12 | done (519 ห้อง) | 1520 | 725 | 795 | 1044 | 686 | 1044 | 1520 | 1044 | 1044 | 815 | 113 | 0 | 0 | **EXPLAINED** |
| 2026-07-06 | aged-out (data ครบ) | 2404 | 1105 | 1299 | 1223 | 1206 | 1223 | 2404 | 1223 | 1223 | 932 | 106 | 18 | 0 | **EXPLAINED** |
| 2026-07-08 | cancelled¹ | 4 | 2 | 2 | 2 | 2 | 2 | 4 | 2 | 2 | 4 | 0 | 2 | 0 | **EXPLAINED** |

¹ `2026-07-08` มี scraper job ที่ถูก cancel ระหว่างทดสอบ ข้อมูล qc มาจาก scrape/manual ก่อนหน้า

## แกนหลัก (DATE-correctness) — ตรงเป๊ะทุกวัน

ทุกข้อเป็น `✅ EXPECTED` ทั้ง 3 วัน:

- `dashboard_total_cases == qc_scores_by_case_at` (1044 / 1223 / 2) — แหล่งเดียวกัน `case_at`
- `dashboard_total_chats == messages_total` (1520 / 2404 / 4)
- `commission_case_count == ranking_case_sum` (1044 / 1223 / 2)
- `customer + admin + system == messages_total`
- `qc_case_at NULL (ทั้งตาราง) == 0` (backfill: total 12185 / filled 12185 / fallback 0)

## รายละเอียด mismatch ทุกจุด (อธิบายตามนิยาม — EXPLAINED)

| field | ส่วนต่าง | นิยามที่อธิบาย |
|---|---|---|
| `ranking_case_sum` < `qc` | `+ qc_no_admin + qc_inactive_admin` | ranking JOIN เฉพาะ **admin ที่ active**; เคสไม่มี admin (pending/manual) หรือ admin ปิดใช้งานถูกตัด (ทั้ง 3 วัน = 0) |
| `chat_review_rows` < `admin_messages` | `+ admin_messages_without_id` (109 / 93 / 0) | Chat Review นับ admin message ที่มี `admin_id`; ข้อความ admin ที่ยังไม่ผูกแอดมินถูกตัด |
| `ai_review_queue_count` ≠ `qc` | ตารางแยก คีย์ด้วย timestamp ของตัวเอง | `ai_review_queue` ไม่ใช่ subset ต่อวันของ qc; 07-12/07-06 ผูก qc วันเดียวกันครบ (same_day 815/932, diff_day 0) |
| `manual_cases_count` ≤ `qc` | subset | เคสที่แอดมินกรอกมือ (`messages.source='manual'`) — 0 / 18 / 2 |
| `disputes_count` ≤ `qc` | subset ต่อเคส | ข้อโต้แย้งที่ผูก qc case ของวันนั้น (0 ทุกวัน) |
| `evidence_exact_verified` ≤ `qc` | subset | หลักฐานภาพที่ verify + exact แล้ว (113 / 106 / 0) |
| `scraperCoverage` 07-08 = `missing 1` | ไม่มี scrape job done ครอบ 07-08 | สอดคล้อง — 07-08 ไม่ได้ scrape ปกติ (job cancelled) |

**ไม่มี unexplained mismatch — ทุกส่วนต่างมีนิยามรองรับ**

## ⚠️ ประเด็นแยก #1 — DATA-HYGIENE (ไม่ใช่บั๊กเรื่องวัน / ไม่เกี่ยว case_at)

`2026-07-08` มี `ai_review_queue` **4 แถวเป็น orphan**: `qc_score_id` ชี้ไปเคสที่ถูกลบแล้ว
(`dangling=4, null=0`). สาเหตุ: ตาราง `ai_review_queue` บน production ถูกสร้างจาก migrate form
ที่ **ไม่มี `ON DELETE CASCADE`** (`sql/schema.sql:471`) ต่างจาก `sql/schema.sql:194` ที่มี FK →
พอ qc_scores ถูกลบ แถว ai_review ค้างเป็นผี (โผล่ในคิวแต่เปิดไม่ได้).

- เป็นปัญหาเดิมที่มีอยู่ก่อน **ไม่เกี่ยวกับ `case_at`** และ **ไม่กระทบ reconcile วัน** (แกน date PASS)
- **แนวทางแก้ (รอไฟเขียว):** ลบแถว orphan (`DELETE FROM ai_review_queue r WHERE qc_score_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM qc_scores q WHERE q.id=r.qc_score_id)`) + เพิ่ม FK `ON DELETE CASCADE` กันเกิดซ้ำ

## ⚠️ ประเด็นแยก #2 — `case_date` vs `case_at` (ต้องตัดสินใจเชิงธุรกิจ)

ระบบมี 2 คอลัมน์วันโดยเจตนา:

| คอลัมน์ | นิยาม | ใช้ที่ไหน |
|---|---|---|
| **`case_at`** (timestamptz) | เวลาเคสจริง: **admin reply** → customer msg → created_at | **Dashboard, Chat Review, Ranking, Commission, AI Review filter, insights, debug/counts** (analytics ทั้งหมด) |
| **`case_date`** (date) | วัน Bangkok ของ **ข้อความลูกค้า** (customer-first) | **`case_ref` = QC-YYYYMMDD** เท่านั้น (ตัวระบุเคส/ชื่อไฟล์หลักฐาน) — นิยามเดียวกับ `ai_review_queue.case_ref` |

**ความจริงที่วัดได้จาก production:** `case_date` (วันลูกค้า) ≠ `case_at` (วันแอดมิน)
ใน **1,311 / 12,185 เคส (10.8%)** — เพราะลูกค้าทักคืนหนึ่ง แอดมินตอบเช้าวันถัดไป (พฤติกรรมซัพพอร์ตจริง)

**ผลกระทบ:** `case_ref` (เช่น `QC-20260706-xxxxxx`) อิง **วันที่ลูกค้าทัก** แต่ dashboard นับเคสนั้นตาม
**วันที่แอดมินตอบ** — สำหรับ 10.8% ของเคส ป้ายวันใน case_ref กับ bucket ของ dashboard จะต่างกัน (มัก 1 วัน)

**สถานะปัจจุบัน = EXPECTED ตาม spec P1** (analytics มาตรฐานที่ `case_at` = วันแอดมินตอบ = วันที่ถูกประเมิน QC)
โดย `case_ref`/`case_date` ถูก **แช่แข็งไว้** (อยู่ใน evidence logic ที่ห้ามแตะ)

**ทางเลือกให้ตัดสินใจ:**
- **(ก) คงไว้** — `case_ref` = "วันลูกค้าติดต่อ" (ตัวระบุเคสที่เสถียร), dashboard = "วันประเมิน QC" คนละความหมายโดยตั้งใจ ← ค่าเริ่มต้นตอนนี้
- **(ข) จัดให้ตรง** — เปลี่ยน `case_ref` ให้อิง `case_at` (วันแอดมิน) ให้ป้ายวันตรง dashboard — **แต่จะเปลี่ยนค่า `case_ref` เดิม = แตะ evidence/display** (นอกสโคป ต้องขออนุมัติแยก)

## Final verdict

**PASS (DATE-correctness):** ทุก module ที่นับเคส (dashboard / chat review / ranking / commission /
ai review / evidence / manual / disputes / messages) reconcile กับ `qc_scores_by_case_at`
โดย **unexplained mismatch = 0** ทั้ง 3 วัน production จริง

เหลือ 2 ประเด็นที่ **แยกจาก date-correctness** และรอการตัดสินใจ (ไม่บล็อก verdict):
1. ai_review orphan 4 แถว (data-hygiene) — เสนอลบ + เพิ่ม FK
2. `case_ref` (วันลูกค้า) vs dashboard (วันแอดมิน) ต่าง 10.8% — เลือก (ก) คงไว้ หรือ (ข) จัดให้ตรง

## Reproduce

```bash
QC_API_URL=<production> QC_API_KEY=<admin key>  # อ่านจาก .env ผ่าน dotenv
npm run audit:date-reconcile -- --date=2026-07-12 --date=2026-07-06 --date=2026-07-08
```

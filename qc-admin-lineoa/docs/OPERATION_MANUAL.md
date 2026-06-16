# QCAdmin_1 — Operation Manual (คู่มือใช้งานประจำวัน)

ระบบควบคุมคุณภาพการตอบแชท LINE OA ด้วย AI QC engine v4

---

## 1. บทบาทผู้ใช้ (Roles)

| Role           | username เริ่มต้น      | เห็น/ทำอะไรได้                                           |
| -------------- | ---------------------- | -------------------------------------------------------- |
| **manager**    | `manager`              | ทุกหน้า + อนุมัติ/ปฏิเสธ dispute + แก้คะแนน + จัดการ SOP |
| **marketing**  | `marketing`            | dashboard, commission, performance (ภาพรวมการตลาด)       |
| **admin** (PK) | `<slug>` เช่น `pk-mei` | ดูคะแนนตัวเอง + โต้แย้งผล (dispute) ของตัวเอง            |

> รหัสเริ่มต้น: `manager123` / `marketing123` / admin = `pk1234` — **เปลี่ยนก่อนใช้งานจริง**
> login ที่ `/login`; session อายุ 7 วัน (HMAC cookie). หมดอายุ → เด้งกลับ login อัตโนมัติ

---

## 2. รอบการทำงานประจำวัน (Daily Cycle)

```
Scraper รายวัน (เครื่อง operator)
  → สแกน Yesterday zone ทั้งหมด แล้วเก็บจาก chat สุดท้าย
  → POST /api/admin/log-reply (กรองเฉพาะ admin ชื่อขึ้นต้น PK)
  → runQc(): intent → SOP match → 8-มิติ rubric → qc_scores + qc_score_details
  → Telegram แจ้งเตือนเคส fail/fatal
แอดมิน/ผู้จัดการ
  → ดู Dashboard / QC Monitoring เช้าวันถัดไป
  → แอดมินโต้แย้งเคสที่ไม่เห็นด้วย → Manager ตรวจ → ปรับคะแนน
  → สิ้นเดือน: บันทึก Commission snapshot
```

---

## 3. หน้าจอหลัก

| หน้า                | URL                  | ใช้ทำอะไร                                                       |
| ------------------- | -------------------- | --------------------------------------------------------------- |
| Executive Dashboard | `/`                  | KPI รวม, QA trend, Category breakdown, SOP coverage, commission |
| QC Monitoring       | `/qc-dashboard`      | คะแนนรายเคส, filter ตามวัน/แอดมิน                               |
| Chat Review         | `/chat-review`       | ไล่ดูบทสนทนา + คะแนนต่อข้อความ (ChatModal)                      |
| SOP Knowledge Base  | `/sop`               | ค้นหา/แก้ไข SOP, used_count, coverage, เปิด-ปิดใช้งาน           |
| Disputes            | `/disputes`          | คิวโต้แย้ง → manager อนุมัติ/ปฏิเสธ + แก้คะแนน                  |
| System Events       | `/system-events`     | บันทึกเหตุการณ์ระบบล่ม (ยกเว้น SLA ช่วงนั้น)                    |
| Admin Performance   | `/admin-performance` | heatmap รายมิติ, ranking, coaching needed, export CSV           |
| Commission          | `/commission`        | คำนวณค่าคอม tier × upsell, override, export, บันทึกลง DB        |

---

## 4. QC Scoring (engine v4)

**น้ำหนักคงที่ (รวม intent-specific):**
Greeting&Closing 15 · Problem Solving&Accuracy 20 · Communication&Tone 20 · Response Time 10
· Upselling 10 (promo/bonus) · Credit Deposit/Withdraw 10 (ฝาก/ถอน) · KYC 10 (kyc)

- มิติที่ไม่เกี่ยวกับ intent = **N/A** (ไม่คิดในตัวหาร — ไม่ทำให้คะแนนเพี้ยน) แต่บันทึกเหตุผลไว้
- **Minor** (ไม่มีคำลงท้ายสุภาพ/ตอบสั้น/ส่งซ้ำ) → -5
- **Fatal** (หยาบคาย/โทษลูกค้า/รับประกันผลพนัน/ปฏิเสธช่วยเหลือ) → คะแนน = **0**
- **SLA exception**: ถ้ามี System Event ครอบเวลานั้น → response time ไม่หักเต็ม (floor 80)

**Commission tier:** 90–100 ×1.2 Excellent · 80–89 ×1.0 Standard · 70–79 ×0.5 Warning · <70 ×0 Critical
commission = upsell × 1% × multiplier

> 📌 **หมายเหตุการ calibrate (มิ.ย. 2026):** ปรับ `dimProblemSolving` ให้ให้เครดิตการครอบคลุม
> required keyword + เนื้อหา (ไม่ลงโทษการเรียบเรียงใหม่ที่ถูกต้อง) เพื่อให้คำตอบที่ดีจริงได้ ≥70
> ไม่ถูกจัดเป็น Warning โดยไม่เป็นธรรม — วัดผลด้วย `npm run test:qc-accuracy` (Outcome 100%)

---

## 5. งานประจำของผู้จัดการ

1. **ตรวจ dispute** (`/disputes`) — เลือกเคส → ดูคำถาม/คำตอบ/เหตุผล AI/มิติที่ตก → ใส่คะแนนใหม่ + อนุมัติ/ปฏิเสธ
2. **ปรับ SOP** (`/sop`) — ถ้าพบ SOP ที่ never-matched หรือ keyword ไม่ครอบคลุม:
   - แก้ keyword/required_keywords ผ่าน drawer
   - ปิดใช้งานชั่วคราว = ปุ่ม ON/off (soft); ลบถาวร = ปุ่มลบ (`?hard=true`)
3. **บันทึก System Event** เมื่อระบบ/ธนาคารล่ม → ระบุช่วงเวลา + ติ๊ก affects_sla → เคสช่วงนั้นไม่ถูกหัก response time
4. **สิ้นเดือน** — `/commission` → ตรวจ tier ราย admin → Save → snapshot ลง `admin_commissions` (ลบ period เดิมก่อน, FK-safe)

---

## 6. งานบำรุงรักษา (Maintenance)

| งาน                          | คำสั่ง / การทำ                                               |
| ---------------------------- | ------------------------------------------------------------ |
| ตรวจคุณภาพ SOP               | `DATABASE_URL=… npm run audit:sop` (รวม never-matched)       |
| ตรวจความแม่น QC              | `npm run test:qc-accuracy`                                   |
| ตรวจรับเต็มชุด (offline)     | `npm run uat:check`                                          |
| import SOP ใหม่จาก Excel     | `POST /api/admin/import-sop` (x-api-key)                     |
| เพิ่มบัญชี admin ใหม่        | `POST /api/auth/setup` (สร้าง user จาก PK admins ที่ active) |
| ล้างชื่อ admin มั่ว (non-PK) | `POST /api/admin/cleanup-admins` (x-api-key)                 |

---

## 7. Troubleshooting

| อาการ                                 | สาเหตุ / วิธีแก้                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Dashboard ว่าง / Category ไม่มีข้อมูล | ยังไม่มี `qc_score_details` — รอข้อความใหม่ผ่าน engine v4 หรือ re-run reply     |
| ทุกหน้าเด้งไป login                   | session หมดอายุ หรือยังไม่ตั้ง session — login ใหม่                             |
| คำตอบดีแต่ได้คะแนนต่ำ                 | ตรวจ `matched_sop` + missing_required_keywords ใน evidence; ปรับ keyword SOP    |
| ไม่มี Telegram แจ้งเตือน              | ไม่ได้ตั้ง `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (ระบบจะปิดเงียบ ไม่ error)   |
| Reply ไม่ส่งไป LINE                   | ขาด `LINE_CHANNEL_ACCESS_TOKEN` หรือ `send_line=false` (scraper log อย่างเดียว) |
| Admin ชื่อแปลก/มั่ว                   | scraper ดึงผิด — ระบบกรองเฉพาะชื่อขึ้นต้น PK; รัน cleanup-admins                |
| scraper หยุด/ถูก block                | ลด rate, ตรวจ `auth.json` ยังไม่หมดอายุ, login LINE OA ใหม่                     |

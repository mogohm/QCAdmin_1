# QCAdmin_1 — UAT Checklist (ตรวจรับก่อน Go-Live)

ติ๊ก ✅ เมื่อผ่าน. รันคำสั่งอัตโนมัติ: `npm run uat:check` (qc + qc-accuracy + audit:sop + admin-import)

---

## A. Automated Gate (ต้องผ่านทั้งหมด)

| # | คำสั่ง | เกณฑ์ผ่าน |
|---|---|---|
| A1 | `npm run build` | Compiled successfully, 46 routes |
| A2 | `npm run test:qc` | ผ่าน 31/0 |
| A3 | `npm run test:qc-accuracy` | Intent ≥ 80%, Outcome ≥ 80% (ปัจจุบัน 97% / 100%) |
| A4 | `npm run test:admin-import` | ผ่าน 32/0 (เฉพาะ PK admin) |
| A5 | `npm run test:admin-reply` | ผ่าน 24/0 (runQc + qc_score_details) |
| A6 | `npm run audit:sop` | ไม่มี critical issue (dup/empty answer/bad category) |
| A7 | `ADMIN_API_KEY=… npm run test:dashboard-api` | ผ่าน 29/0 (รวม SOP CRUD live) |

---

## B. End-to-End Flow (ทดสอบบนระบบจริง)

- [ ] **B1 Customer → Admin reply**: ส่งข้อความตอบผ่าน scraper/admin reply → มี record ใน `messages`
- [ ] **B2 runQc**: reply สร้าง row ใน `qc_scores` พร้อม `final_score`, `intent`, `matched_sop_id`
- [ ] **B3 Intent detection**: intent ตรงกับเนื้อหาคำถาม (ดูใน Chat Review / dispute)
- [ ] **B4 SOP matching**: `matched_sop_topic` + `sop_confidence` แสดงถูกต้อง
- [ ] **B5 qc_score_details**: มีรายมิติ (greetingClosing/problemSolving/… + minor + fatal) ต่อ 1 reply
- [ ] **B6 Dashboard**: Executive แสดง KPI + Category Breakdown จาก `qc_score_details` (ไม่ใช่ค่าว่าง)
- [ ] **B7 ChatModal / Chat Review**: เปิดดูบทสนทนา + คะแนนต่อข้อความได้
- [ ] **B8 Dispute create**: admin กดโต้แย้ง → row ใน `qc_disputes` (status pending) + Telegram `[DISPUTE CREATED]`
- [ ] **B9 Manager approve/reject**: manager อนุมัติ + แก้คะแนน → `qc_scores.final_score` อัปเดต, dispute = approved
- [ ] **B10 Commission adjustment**: หน้า Commission สะท้อนคะแนนใหม่ (tier/multiplier) + บันทึกลง `admin_commissions`
- [ ] **B11 Telegram alert**: เคส fail/fatal ส่งแจ้งเตือน `[QC FAIL/FATAL]` (ถ้าตั้ง token)

---

## C. Security

- [ ] **C1** เรียก `/api/dashboard` โดยไม่มี session/api-key → **401** (หลังตั้ง `ADMIN_API_KEY` บน prod)
- [ ] **C2** read API ภายใน (dashboard, replies, chat, customer, scraper/report, admin/list) require session/api-key
- [ ] **C3** `/api/admin/reply`, `/api/admin/log-reply` ต้องมี api-key
- [ ] **C4** dispute approve/reject (`PATCH /api/qc-disputes/:id`) เฉพาะ manager/admin
- [ ] **C5** SOP create/edit/delete เฉพาะ admin/manager (`/api/sop`, `/api/sop/:id`)
- [ ] **C6** session หมดอายุ → ทุกหน้า (AppShell) redirect ไป `/login?expired=1` อัตโนมัติ
- [ ] **C7** ไม่มี secret หลุดฝั่ง client — api-key ถูกพิมพ์โดยผู้ใช้ในหน้า admin/scraper เท่านั้น ไม่ฝังในโค้ด
- [ ] **C8** Telegram/LINE token, DATABASE_URL อ่านจาก `process.env` เท่านั้น (ไม่มีในโค้ด/ไม่ commit)
- [ ] **C9** เปลี่ยนรหัสผ่าน default (manager123/marketing123/pk1234) แล้ว

---

## D. UI States (ทุกหน้า)

ตรวจ 9 หน้า: Executive, QC Monitoring, Chat Review, SOP, Disputes, System Events, Admin Performance, Commission, Customer Detail

- [ ] **D1 Empty state**: ไม่มีข้อมูล → แสดงข้อความ ("ไม่มี dispute", "ยังไม่มีคะแนนรายมิติ", …) ไม่ใช่หน้าว่าง/error
- [ ] **D2 Loading**: ระหว่างโหลดมีสถานะ (ปุ่ม "...") — Executive/Scraper มี explicit loading
- [ ] **D3 Session expired**: เปิดหน้าโดยไม่ login (บน prod) → เด้งไป login
- [ ] **D4 ไม่มี mock/static data**: ทุกหน้า bind `/api/*` จริง (ตรวจแล้ว — 0 mock)

---

## E. Data Quality (`npm run audit:sop`)

- [ ] **E1** Total SOP ≥ 90 records
- [ ] **E2** Duplicate topics = 0
- [ ] **E3** Empty answers = 0
- [ ] **E4** Category not matched = 0
- [ ] **E5** (DB) SOP never-matched — review รายการที่ไม่เคยถูก match เพื่อปรับ keyword
- [ ] **E6** Missing required_keywords — review (ปัจจุบัน ~22% ยอมรับได้, ไม่ critical)

---

## F. Performance

- [ ] **F1** ทุก list API มี `LIMIT` (replies/sop/disputes/dashboard ✓)
- [ ] **F2** มี date filter (`from`/`to`) ใน dashboard/replies/scraper report
- [ ] **F3** `/api/replies` มี pagination (page/limit/offset) ✓
- [ ] **F4** Dashboard ≤ ~12 query แบบ parallel (`Promise.all`), bounded ✓
- [ ] **F5** Scraper หน่วงเวลาเพียงพอ ไม่โดน LINE block

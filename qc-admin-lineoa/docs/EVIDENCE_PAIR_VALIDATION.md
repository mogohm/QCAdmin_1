# EVIDENCE EXACT-PAIR VALIDATION — รายงานตรวจจริงบน production

วันที่ตรวจ: 2026-07-07 · run: `EVIDENCE_CAPTURE_MODE=all node scraper.js --yesterday --headed --limit=30`
Invariant: **1 QC case → block ลูกค้า + คำตอบแอดมินที่แน่นอน → screenshot ของคู่นั้น**

## ผลรวมจาก run จริง (target 2026-07-06)
- capture ทั้งหมด: **~47 เคส** · `exact` (conf 95–100%): **~40** · `uncertain` (ลด grade อย่างซื่อสัตย์): **~7**
- เคส `uncertain` = หา bubble ไม่ครบ (found 1/2, 2/3) → ระบบ **ไม่อ้างว่าเป็นหลักฐาน exact** ตาม spec
- edge case จริงที่เจอ + จัดการถูก: virtual re-render หลัง scroll ทำ tag หาย → ลดเป็น uncertain 48%, ข้าม pair_focus

## ตาราง 5 เคส (เทียบ UI text vs evidence pair record บน production DB)
| case_ref | qc_score | customer text | admin text | timestamp | match | conf |
|---|---|---|---|---|---|---|
| QC-20260706-AC76AB | f747f5d0 | PASS | PASS* | PASS | exact | 100% |
| QC-20260706-0AA928 | 69016725 | PASS | PASS | PASS | exact | 98% |
| QC-20260706-9284AC | 600bb140 | PASS | PASS | PASS | exact | 100% |
| QC-20260706-5381A7 | 1f67405c | PASS | PASS | PASS | exact | 100% |
| QC-20260706-6ADB6D | 872fe10c | PASS | PASS | PASS | exact | 95% |

*AC76AB ตอนแรกรายงาน FAIL — ตรวจแล้วเป็น masking เลขบัญชี (`5292892865` → `•••••••865`)
ของ API สำหรับ role ที่ไม่มี `chat.view.all` — ข้อความจริงตรงกัน 100%

## การตรวจด้วยตาจริง (เปิดไฟล์ภาพ)
1. **QC-20260706-DB46C9-pair-focus.jpg**: เห็น bubble ลูกค้า "ฝากถอนกลับมาเมื่อไรครับ · 23:39"
   + คำตอบแอดมิน (PK - บีท) ระบบฝาก-ถอนปิดชั่วคราว · Read 23:39 — **ตรงกับคู่ที่ให้คะแนนเป๊ะ** ✅
2. **QC-20260706-8B90D0-pair-focus.jpg** (multi-bubble found=3/3): เห็น block ลูกค้า
   "ยังงี้จะเล่นได้ไหมครับ / แปบๆปิดปรับปรุงอะครับ · 12:09" + แอดมิน "ได้เล่นแน่นอนนะคะ" (PK Snack)
   — ตรง DB pair (`customer_text`/`admin_text`) ทุกตัวอักษร ✅

## Recapture (ซ่อมเคสเก่า)
```
node scraper.js --recapture-evidence=f747f5d0-94ef-4369-8f29-25987d87dc8e --headed
→ [RECAPTURE] QC-20260706-AC76AB · เปิดห้องเดิมตรง /chat/<uid> · โหลดประวัติถึง 2026-06-29
→ [EVIDENCE] match=exact conf=100% found=2/2 · saved=2 ✅
```
(บั๊กแรกพบ: jobId="recapture" ชน uuid column → แก้แล้ว ส่งเฉพาะ job uuid จริง)

## Final acceptance
- [x] capture หลังรู้คู่ที่ตรวจ (chat-batch คืน qc_results → locate → scroll → shoot)
- [x] qc_scores เก็บ message ids + source keys ครบทุก bubble
- [x] ไม่ match ด้วย text อย่างเดียว (direction+text+เวลา+ลำดับ DOM; test 20/20)
- [x] ข้อความที่ให้คะแนนปรากฏในภาพจริง (ตรวจด้วยตา 2 เคสรวม multi-bubble)
- [x] ภาพเก่า = conversation_reference/legacy_unlinked + คำเตือนใน EvidenceViewer
- [x] recapture ใช้ได้กับเคสเก่า
- [x] EvidenceViewer แยก "หลักฐานของข้อความที่ประเมิน" (badge ✅/🟡/⚠️ + ลูกค้าส่ง/แอดมินตอบ/เวลาตอบใต้ภาพ) จากภาพอ้างอิงห้องแชท

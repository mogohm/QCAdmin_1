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

---

# EVIDENCE INTEGRITY FIX — รอบตรวจ 2026-07-07 (wrong case / false 100%)

## บั๊ก production ที่รายงาน
Viewer เคส `QC-20260706-698D5E` แสดงการ์ดหลักฐาน `QC-20260706-E15B3E` พร้อมป้าย "ตรง 100%"

## Root cause (Phase 8 trace)
1. แถว ai_review_queue บางแถว `qc_score_id = NULL` → viewer ส่งแค่ `conversation_id`
2. API branch `!qcId` ปล่อย `match_status` เดิม (exact) ของ **ทุกเคสใน conversation**
3. Query `OR conversation_id` ผสมหลักฐานข้ามเคส
4. ป้าย ✅100% มาจาก **locator confidence** ไม่ใช่การยืนยันภาพจริง

## การแก้
- **API แยกขาด**: `exactEvidence` (WHERE qc_score_id เท่านั้น) / `conversationReferences` — ไม่ merge; ไม่มี qc_score_id → exact ว่างเสมอ
- **identity_check ฝั่ง server** ทุก exact item (qc/case_ref/conversation/message ids — ข้อมูลไม่ครบ = ไม่ผ่าน)
- **capture_manifest + post-capture verification**: อ่านข้อความจาก DOM ตอนถ่ายจริง เทียบ hash กับคู่ที่คาดหวัง — `verified` เท่านั้นถึงเป็น exact; locator conf แยกขาด
- **Viewer**: แท็บ exact ต้อง all_match + verified + exact; แท็บ "⚠️ ยังไม่ผ่านการตรวจสอบ"; badge ❌ เมื่อไม่ตรงเคส + debug บอกเหตุผล
- **Quarantine**: audit A-F + กักกัน mismatch → `rejected`/`invalid_reference` (log ใน data_repair_logs)

## บั๊กที่ verification จับได้เอง (พิสูจน์ว่าระบบทำงาน)
คู่ที่ 2+ ใน chat เดียวกันใช้ tag ซ้ำ (`qa-c0`) → อ่านข้อความจาก bubble คู่แรก →
`verify=failed(text=0%) แม้ locator=100%` → ถูกลดเป็น uncertain (เดิมจะเป็น false-exact)
แก้: ล้าง tag ค้าง + tag ไม่ซ้ำข้ามเคส → คู่ติดกันทั้งหมด verified

## Audit production (832 แถวที่มี qc linkage)
case_ref/conversation/pair mismatch = **0** · qc_missing = 4 → **quarantined** ·
exact_unverified (ก่อนมี manifest) = 125 → ไม่แสดงเป็น exact อีกต่อไป (แท็บ ⚠️)

## PHASE 12 — 10 เคสจริง (production API): **10/10 PASS ทุกช่อง**
case_ref_match / identity_all_match / verified / cust+admin text ใน manifest / timestamp — PASS ครบ
- conversation-only query → `exactEvidence = 0` ✅ (698D5E scenario เป็นไปไม่ได้แล้ว)
- wrong-case exact = **0** ✅ · false-100% badge = **0** ✅
- ตรวจภาพด้วยตา `QC-20260706-B63032`: ภาพ = "เปิดอีกทีเมื่อไหร่ค่ะ·01:35" + PK-TON ตอบ —
  ตรง manifest.captured_texts ที่เก็บจาก DOM ตอนถ่าย ทุกตัวอักษร ✅
- run จริงหลังแก้ tag: verified ~24 เคส (รวม multi-bubble 3/3) · uncertain 3 (found ไม่ครบ — honest)

## Tests
`test-evidence-integrity.js` 15 เคส (7 สถานการณ์ spec รวม "locator 100% + text ผิด → reject",
"เคส B ใน viewer เคส A → all_match=false") — อยู่ใน uat:check

---

# FINAL PRODUCTION VALIDATION — 2026-07-07 (รอบสุดท้าย)

## เครื่องมือ (ใหม่)
- `npm run audit:evidence-integrity` — ตรวจ A-J read-only (ผ่าน admin API ที่มี DB)
- `npm run quarantine:evidence` — dry-run default, `--apply` เพื่อกักกันจริง (log ใน data_repair_logs)
- audit route: เพิ่ม F (manifest missing), G/H (captured hash ไม่ครอบ expected ทั้งที่ verified), breakdown, demote_ids

## Manifest เป็นของจริง (ไม่ fake)
`captured_customer_texts/captured_admin_texts` อ่านจาก DOM element `[data-qa-ev]` ตอนถ่ายผ่าน
`page.evaluate` — ไม่ได้ copy จาก expectedPair. พิสูจน์เชิงประจักษ์ 2 ครั้ง: (1) บั๊ก stale tag
ทำ captured ≠ expected → verify FAIL (เป็นไปไม่ได้ถ้า copy) (2) anti-fake test:
identity ตรงหมด + locator 100% แต่ DOM เป็นข้อความอื่น → verified=false (19/19 PASS)

## Audit production (หลัง quarantine + demote)
| ตัวชี้วัด | ค่า |
|---|---|
| total evidence | 1,244 |
| exact = verified | ทุกแถว (exact_not_verified = **0**) |
| rejected (quarantined) | 45 + demoted 125+5 |
| legacy references | ~926 (gate เป็น reference ใน viewer) |
| A-H mismatch | **0** |
| I reused url | 1 (ภาพ placeholder 1×1 บนแถว legacy เก่า — flag-only, ถูก gate เป็น reference) |
| J exact-without-verified | **0** |

## บั๊กที่พบและแก้ในรอบนี้ (visual validation จับได้)
**8A4648**: admin bubble ที่ตรวจอยู่นอกกรอบ scroll container (มี broadcast คั่น) แต่ text-hash
ผ่านเพราะอ่านจาก DOM ได้แม้หลุดจอ → ภาพไม่มีข้อความที่ตรวจ
แก้ 2 ชั้น: (1) visibility วัดเทียบ "container ∩ viewport" ไม่ใช่ window (element หลุด container
เคย intersect window หลังแถบพิมพ์ → visible ปลอม) (2) bubble ที่หลุด → เลื่อนทีละใบ + ถ่าย
"ส่วน 2/2" เฉพาะใบนั้น; ไม่เห็นในภาพใดเลย → `bubble_not_visible` → verified=false
Recapture จริง: ส่วน 1 = block ลูกค้า (18:52), ส่วน 2 = admin bubble ธนาคารฯ (Read 20:27) —
เห็นครบทั้งคู่ ✅ · แถวเก่า 5 แถวที่ภาพไม่ครบ → demoted (log ไว้)

## 10-CASE VISUAL VALIDATION (เปิดภาพจริงด้วยตา เทียบ UI text)
| # | case_ref | หมวด | cust | admin | case_ref | สถานะ |
|---|---|---|---|---|---|---|
| 1 | 0BE3AB | low (65) | PASS | PASS | PASS | verified |
| 2 | BAF3D4 | low (64) | PASS | PASS | PASS | verified |
| 3 | 8A4648 | unknown | PASS | PASS* | PASS | verified (2-part หลัง fix) |
| 4 | B7E80A | unknown | PASS | PASS | PASS | verified |
| 5 | 3D9B1E | normal | PASS | PASS | PASS | verified |
| 6 | D3F77D | normal | PASS | PASS | PASS | verified |
| 7 | 63613E | unknown | PASS | PASS | PASS | verified (multi-bubble 3/3) |
| 8 | 99A54F | unknown | PASS | PASS | PASS | verified |
| 9 | B63032 | unknown | PASS | PASS | PASS | verified |
| 10 | C765D5 | unknown | PASS | PASS | PASS | verified |

*8A4648 FAIL ครั้งแรก → แก้ + recapture → PASS. หมวด slow/minor ไม่มีในชุด verified คืนนี้
(ทุกเคสตอบเร็ว/ไม่มี minor flag) — เติมด้วย unknown/normal ตามที่มีจริง ไม่แต่งหมวดปลอม

**ผลรวม: customer 10/10 · admin 10/10 · case_ref 10/10 · wrong-case = 0 · false verified badge = 0**

## Final runs
- `test:evidence-integrity` 19/19 ✅ · `audit:evidence-integrity` CLEAN ✅ · `build` ✅
- `uat:check` ✅ ทุก gate (ยกเว้น uat-feedback:strict — ต้องการ ADMIN_API_KEY ใน shell, env-only)
- recaptured: 1 เคส (8A4648) · demoted เพิ่ม: 5 แถว · remaining failures: 0

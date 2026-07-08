# FUNCTIONAL QA REPORT — QCAdmin_1 / qc-admin-lineoa

รอบ QA: 2026-07-07 · Production: https://qc-admin-1.vercel.app
ดูรายการฟังก์ชันเต็มที่ [FUNCTIONAL_TEST_MATRIX.md](./FUNCTIONAL_TEST_MATRIX.md)

## สรุปผู้บริหาร
งานรอบนี้จัดลำดับตามที่ร้องขอ: **แก้บั๊ก UUID ที่รู้อยู่ (Phase 0) ก่อน** แล้ววางโครงความปลอดภัย + เอกสารเพื่อไล่ QA ต่อเนื่อง. บั๊กหลักถูกแก้และ **ตรวจซ้ำบน production จริงแล้ว**. งานคลิกจริงครบทุกหน้า/ทุกบทบาท (Phase 2–20) เป็นงานต่อเนื่องขนาดใหญ่ที่ยังไม่รันครบ — ระบุไว้ชัดเจนด้านล่าง.

## ตัวเลข
- ฟังก์ชันที่มีหลักฐานผ่าน (scripted/prod): **11** (AI Review 4 actions + id-guard 2 + GET หลัก 3 + scraper strict/deep 2)
- โครงกันบั๊กชนิด id: **5 write routes** hardened (ai-review, ai-review/create-sop, sop/[id], qc-disputes/[id], knowledge-training/[id])
- Regression tests เพิ่ม: **2** (`test:db-id` 20 เคส, `smoke-production.js`)
- บั๊กที่พบ: **1 (P0 วิกฤต)** · แก้แล้ว: **1**
- FAIL คงเหลือ: 0 (นอก env-only) · BLOCKED: 1 (disposable-case DB test — ไม่มี DATABASE_URL ในเครื่องนี้)

## บั๊กที่พบและแก้

### BUG-1 (P0, วิกฤต) — `invalid input syntax for type uuid: "23"` ใน AI Review
- **อาการ:** คลิก action ใด ๆ ใน /ai-review (อนุมัติ/ไม่เกี่ยว/แก้ intent) → 500 raw SQL error, บันทึกไม่ได้เลย
- **Root cause:** `ai_review_queue.reviewed_by` เป็น `UUID` แต่ session `uid = app_users.id` เป็น `SERIAL/INTEGER` (เช่น 23). ทุก action ทำ `reviewed_by=${me.uid}` → cast integer เข้า uuid ล้มเหลว. นี่คือความไม่สอดคล้องชนิดเดียวในระบบ — ที่อื่น (`qc_disputes.reviewed_by`, `user_registration_requests.reviewed_by`) เป็น `TEXT` หมด.
- **การแก้ (canonical = TEXT):**
  1. `reviewed_by` UUID→TEXT (migrate-uat DO-block + schema.sql) — ปลอดภัยเพราะค่าเดิม NULL ทั้งหมด (insert เคยพังมาตลอด)
  2. route เก็บ `reviewed_by = me.name` (TEXT) ให้ตรงทั้งระบบ; `corrected_sop_id` ผ่าน `parseNumericId` (INTEGER)
  3. `lib/db-id.js` — `isUuid` / `parseNumericId` / `validateEntityId` validate id ตามชนิดคอลัมน์ก่อน query
  4. route validate id ก่อน → คืน **error ไทย 400** แทน raw SQL; `catch` log เต็มที่ server, คืนข้อความไทย
- **ตรวจซ้ำ (production):** `PATCH /api/ai-review/23` → **400 + ข้อความไทย** (ไม่มี "invalid input syntax"); nonexistent uuid → 404 ไทย. ✅
- **Regression:** `scripts/test-db-id.js` (20 เคส) + เพิ่มใน `uat:check`; `scripts/smoke-production.js` ทดสอบ 4 actions บนเคส disposable เมื่อมี DB access.

## Hardening (Phase 21/22 — บั๊กคลาสเดียวกัน)
route ที่รับ `[id]` แล้วยิง SQL ตรง ๆ = เสี่ยงชนิด id เดียวกับ P0. ทำ validate + error ไทยแล้ว:
- `sop/[id]` (INTEGER), `qc-disputes/[id]` (UUID), `knowledge-training/[id]` (INTEGER) — validate ก่อน query, catch คืนข้อความไทย, log เต็มที่ server.

## สิ่งที่ยังไม่ได้ทำ / งานต่อเนื่อง (โปร่งใส)
- **Phase 2–20 คลิกจริงครบทุกหน้า/ทุกบทบาท:** ยังไม่รันครบ — ต้องใช้ session ของแต่ละบทบาท (system_admin/manager/leader/admin/marketing) และคลิกทุกปุ่ม/ฟอร์ม/ฟิลเตอร์. ใช้ `docs/FUNCTIONAL_TEST_MATRIX.md` เป็นเช็กลิสต์.
- **Phase 21 เต็มรูปแบบ:** ~25 route ยังคืน `error: e.message`. รอบนี้ทำกลุ่ม `[id]` write routes (เสี่ยงสุด). ที่เหลือควรใช้ helper กลางแบบเดียวกันไล่เก็บ.
- **Disposable-case action test บน production:** BLOCKED เพราะเครื่องนี้ไม่มี `DATABASE_URL`. รัน `node scripts/smoke-production.js` บนเครื่อง/CI ที่ตั้ง `DATABASE_URL` จะทดสอบ 4 actions + ตรวจ DB + cleanup อัตโนมัติ.
- **`scripts/test-all-functions.js` (contract ครบทุก write endpoint):** ยังไม่สร้าง — `smoke-production.js` ครอบส่วน id-type/AI-review ที่เป็นบั๊กปัจจุบันแล้ว.

## Build & gates
- `npm run build` ✅
- `npm run uat:check` ✅ (ทุก gate ผ่าน ยกเว้น `test:uat-feedback:strict` ที่ข้าม migrate เพราะไม่ได้ตั้ง `ADMIN_API_KEY` ใน shell — env-only ไม่ใช่ regression)
- `node scripts/smoke-production.js` ✅ PASS 5 / FAIL 0 / BLOCKED 1

## Known issues คงเหลือ
1. `test:uat-feedback:strict` ต้องมี `ADMIN_API_KEY` ใน env จึงจะรัน migrate sub-step (ไม่งั้นนับเป็น fail).
2. Phase 2–20 live QA ยังไม่ครบ (ดูด้านบน).
3. Scraper chat-list paging: รอบก่อนหน้าปรับให้ page ลงได้ (25→50) แต่ยังไม่ยืนยันว่าถึงวันเป้าหมายเก่า ๆ ครบ (งานแยก).

---

# LIVE CLICK-THROUGH — รอบสมบูรณ์ 2026-07-08 (system_admin บน production)

รัน: `node scripts/qa-live-clickthrough.js` — login ผ่านหน้า UI จริง, เปิดทุกหน้า, ยิง request จริง,
ตรวจ DB mutation ผ่าน API, reload ตรวจ persistence, cleanup ข้อมูลทดสอบอัตโนมัติ

## ผลรวม: **PASS 62 / FAIL 0 / BLOCKED 0**

| ลำดับ | โมดูล | ครอบคลุม | ผล |
|---|---|---|---|
| 1 | AI Review | enqueue อัตโนมัติ + linkage + GET detail + คลิก "ตรวจ" modal 4 แท็บ + สลับแท็บ + อนุมัติ (PATCH) + persistence | ✅ 6/6 |
| 2 | Manual Case | สร้างเคส + runQc + ปรากฏใน Chat Review | ✅ 2/2 |
| 3 | Knowledge Training | create + Test Match (matched=true, confidence) + deactivate | ✅ 3/3 |
| 4 | SOP Manager | create + ปรากฏบนหน้า /sop หลัง reload + edit + soft delete + id ผิดชนิด→400 ไทย | ✅ 5/5 |
| 5 | Disputes | create + approve (updated_score=88 เขียนเข้า qc_scores) + id ผิดชนิด→400 | ✅ 3/3 |
| 6 | System Events | create (affects_sla) + ปรากฏบนหน้า + deactivate | ✅ 3/3 |
| 7 | Admin Performance | dashboard API + date filter + ช่วงว่าง = empty state ไม่ error | ✅ 2/2 |
| 8 | Commission | GET + manual override (localStorage — พฤติกรรมจริงของหน้า) เขียน/อ่าน/คืนค่า + reload | ✅ 2/2 |
| 9 | User Management | create + login + disable → login 403 + enable → login ได้ | ✅ 5/5 |
| 10 | Role Permissions | ถอด permission (commission.view.all) → หายจริง → คืน → กลับมา (persistence 2 ทาง) | ✅ 1/1 |
| 11 | Registration | สมัคร pending + pending login ถูกปฏิเสธ + approve → login ได้ | ✅ 3/3 |
| 12 | Scraper Control | วันนี้ถูกบล็อก (400 ไทย) + สร้าง job strict + ยกเลิก job ด้วย session | ✅ 3/3 |
| — | ทุกหน้า (21 หน้า) | ไม่มี 5xx / raw SQL / [object Object] / js error / redirect ผิด | ✅ 21/21 |
| — | Evidence contract | bundle ตรงเคส (exactEvidence) | ✅ 1/1 |

## บั๊กที่พบจาก click-through และแก้แล้ว (รอบก่อน → ยืนยันผ่านรอบนี้)
1. **qc-disputes/[id]**: id เป็น INTEGER แต่ validator (ที่เพิ่มตอน harden) เช็ค UUID → approve พัง 400 — แก้เป็น int ✅ (updated=88)
2. **scraper job DELETE**: รับแค่ x-api-key → session admin ยกเลิกไม่ได้ — แก้เป็น guard(scraper.run) ✅ (cancelled=1)
3. **commission hydration** (React #418): new Date() ตอน prerender — แก้ตั้งวันที่ใน useEffect ✅ (หน้าโหลดสะอาด)

## หมายเหตุ
- Commission "manual override" เป็น localStorage ฝั่ง client (ไม่มี DB write) — ทดสอบตามพฤติกรรมจริง
- Roles permissions อ่านจาก list endpoint (`/api/system/roles` → roles[].permissions)
- P0/P1 คงเหลือ: **0**

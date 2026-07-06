# FUNCTIONAL TEST MATRIX — QCAdmin_1 / qc-admin-lineoa

Production: https://qc-admin-1.vercel.app
อัปเดต: 2026-07-07

**สถานะ**
- ✅ PASS — ทดสอบแล้วผ่าน (มีหลักฐาน)
- ❌ FAIL — ทดสอบแล้วพบปัญหา
- 🔧 FIXED — เคยพัง แก้แล้ว + ตรวจซ้ำผ่าน
- ⏳ NOT RUN — ยังไม่ได้ทดสอบเชิงคลิกจริง (ต้องใช้ session/บทบาทจริง)
- 🧪 SCRIPTED — ครอบคลุมด้วย automated test (`smoke-production.js` / `test-db-id.js` / `uat:check`)

> ขอบเขตรอบนี้: **PHASE 0 (บั๊ก UUID)** ถูกจัดลำดับความสำคัญสูงสุดตามที่ร้องขอ — reproduce, แก้, deploy, migrate, ตรวจซ้ำบน production แล้ว. เพิ่มโครง safety (db-id validation, smoke test, error hardening) และเอกสารนี้เพื่อไล่เก็บ phase ที่เหลือต่อ. Phase 2–20 ที่ต้องคลิกจริงด้วยบทบาทผู้ใช้ ยังเป็น ⏳ NOT RUN เว้นที่ระบุ.

---

## PHASE 0 — บั๊ก UUID (AI Review) — 🔧 FIXED + 🧪 SCRIPTED

| ID | ฟังก์ชัน | API | ตาราง | Expected | สถานะ |
|----|----------|-----|-------|----------|-------|
| P0-1 | อนุมัติผล AI | PATCH /api/ai-review/[id] | ai_review_queue | status=approved, reviewed_by(TEXT) | 🔧 FIXED |
| P0-2 | ไม่เกี่ยว QC | PATCH /api/ai-review/[id] | ai_review_queue | status=not_relevant | 🔧 FIXED |
| P0-3 | แก้ Intent | PATCH /api/ai-review/[id] | ai_review_queue, qc_scores | status=corrected + intent | 🔧 FIXED |
| P0-4 | สร้าง SOP + สอน AI | POST /api/ai-review/[id]/create-sop | sop_scripts, ai_review_queue | sop row + source_case_id(UUID) | 🔧 FIXED |
| P0-5 | id ผิดชนิด "23" | PATCH /api/ai-review/23 | — | 400 ข้อความไทย (ไม่มี raw SQL) | ✅ PASS (prod) |
| P0-6 | id UUID ไม่มีจริง | PATCH /api/ai-review/&lt;uuid&gt; | — | 404 ข้อความไทย | ✅ PASS (prod) |

**Root cause:** `ai_review_queue.reviewed_by` เป็น `UUID` แต่ session `uid` = `app_users.id` (SERIAL/integer) → ทุก action set `reviewed_by=me.uid` → `invalid input syntax for type uuid: "23"`.
**Fix (canonical):** `reviewed_by` → `TEXT` (ให้ตรงกับ qc_disputes/registration ทั้งระบบ), เก็บ `me.name`; validate route id ด้วย `lib/db-id.js` ก่อน query; คืน error ไทย, log เต็มที่ server.

### ชนิด id จริงในระบบ (อ้างอิงถาวร)
| คอลัมน์ | ชนิดจริง |
|---------|----------|
| ai_review_queue.id | UUID |
| ai_review_queue.qc_score_id / conversation_id / message_id | UUID |
| ai_review_queue.matched_sop_id / corrected_sop_id | INTEGER (= sop_scripts.id) |
| ai_review_queue.reviewed_by | **TEXT** (แก้จาก UUID) |
| sop_scripts.id | INTEGER (SERIAL) |
| sop_scripts.source_case_id | UUID |
| app_users.id | INTEGER (SERIAL) → session uid |
| qc_disputes.id | UUID; qc_disputes.reviewed_by TEXT |

---

## PHASE 1 — Function Inventory (หน้า + write API)

### Pages
| หน้า | บทบาทหลัก | สถานะทดสอบ |
|------|-----------|-----------|
| / (Dashboard) | ทุกบทบาท | ⏳ NOT RUN |
| /qc-dashboard | qc/leader/manager | ⏳ NOT RUN |
| /chat-review | qc/leader | ⏳ NOT RUN |
| /ai-review | leader/manager | 🔧 FIXED (actions) |
| /manual-case | qc/leader | ⏳ NOT RUN |
| /knowledge-training | leader/manager | ⏳ NOT RUN |
| /sop | leader/manager | 🧪 SCRIPTED (GET) + [id] hardened |
| /disputes | qc/leader | ⏳ NOT RUN |
| /system-events | manager/admin | ⏳ NOT RUN |
| /admin-performance | manager | ⏳ NOT RUN |
| /commission | manager | ⏳ NOT RUN |
| /marketing-dashboard | marketing | ⏳ NOT RUN |
| /scraper | admin | ✅ PASS (strict/deep, today-block — ทดสอบ live รอบก่อน) |
| /system/users | system_admin | ⏳ NOT RUN |
| /system/roles | system_admin | ⏳ NOT RUN |
| /system/registration-requests | system_admin | ⏳ NOT RUN |
| /login /register | สาธารณะ | ⏳ NOT RUN |
| /leaderboard /manager-dashboard /admin-dashboard /admin | ตามบทบาท | ⏳ NOT RUN |

### Write APIs (POST/PATCH/PUT/DELETE) — จุดที่มี id param = เสี่ยงชนิด id
| API | id ชนิด | validate id | error ไทย | สถานะ |
|-----|---------|-------------|-----------|-------|
| ai-review/[id] (PATCH) | uuid | ✅ | ✅ | 🔧 FIXED |
| ai-review/[id]/create-sop | uuid | ✅ | ✅ | 🔧 FIXED |
| sop/[id] (PATCH/DELETE) | int | ✅ | ✅ | 🔧 FIXED |
| qc-disputes/[id] (PATCH) | uuid | ✅ | ✅ | 🔧 FIXED |
| knowledge-training/[id] (PATCH) | int | ✅ | ✅ | 🔧 FIXED |
| config/rules/[id] | ? | ⏳ | — | ⏳ NOT RUN |
| system-events/[id] | uuid? | ⏳ | — | ⏳ NOT RUN |
| system/users/[id] | int? | ⏳ | — | ⏳ NOT RUN |
| system/roles/[role_key] | text | n/a | — | ⏳ NOT RUN |
| scraper/job, scraper/poll, scraper/chat-batch | uuid | ✅ (มี validateScrapeRange/uuid) | ✅ | ✅ PASS |
| manual-case, commission, system-events (POST) | — | n/a | ⏳ | ⏳ NOT RUN |

> **Known finding (Phase 21):** ~25 route คืน `error: e.message` ตรง ๆ. รอบนี้ทำ hardening กลุ่ม `[id]` write routes (บั๊กคลาสเดียวกับ P0) แล้ว; ที่เหลือเป็นงานต่อเนื่อง (ดู FUNCTIONAL_QA_REPORT.md).

---

## Automated coverage (รันซ้ำได้)
| เครื่องมือ | ครอบคลุม |
|-----------|----------|
| `npm run test:db-id` | isUuid / parseNumericId / validateEntityId (20 เคส) — กันบั๊กชนิด id |
| `node scripts/smoke-production.js` | AI Review actions (disposable case), id="23"→400, nonexistent→404, GET หลัก ไม่ leak raw error |
| `npm run uat:check` | build + db-id + qc + scraper(57) + permissions + auth + thai-ui + evidence + uat-feedback |

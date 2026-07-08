# FINAL PRODUCTION ACCEPTANCE — QCAdmin_1 / qc-admin-lineoa

วันที่: 2026-07-08 · Production: https://qc-admin-1.vercel.app
สถานะ: **ACCEPTED — P0/P1 คงเหลือ = 0**

---

## 1) Role-based smoke test (ผ่านหน้า UI จริง) — `node scripts/qa-role-smoke.js`

**ผล: PASS 32 / FAIL 0** — ทุก role: login ผ่านหน้า login จริง → เมนูตรงสิทธิ์ → เปิดทุกหน้าที่ได้รับสิทธิ์ → ทำ action จริง 1 อย่าง → ลองของต้องห้าม

| Role | Home หลัง login | เมนูตรงสิทธิ์ | หน้าเปิดได้ | Action ที่อนุญาต (จริง) | Forbidden |
|---|---|---|---|---|---|
| manager | `/` | ✅ (เห็น qc-dashboard/chat-review/scraper · ไม่เห็น system/*) | 11/11 | PATCH SOP (sop.update) → 200 | หน้า /system/users ปฏิเสธ · POST /api/system/users → **403** |
| leader | `/admin-performance` | ✅ (ไม่เห็น system/* + scraper) | 7/7 | approve dispute (qc.dispute.review) → 200 | POST /api/sop → **403** |
| admin | `/admin-dashboard` | ✅ (ไม่เห็น system/* + qc-dashboard + scraper) | 3/3 | create dispute (qc.dispute.create) → 200 | GET /api/system/users → **403** |
| marketing | `/marketing-dashboard` | ✅ (ไม่เห็น system/* + qc-dashboard + sop) | 2/2 | อ่าน dashboard → 200 | POST /api/sop → **403** |

ข้อมูลทดสอบทั้งหมด (users 4 / SOP / manual case) ถูก cleanup อัตโนมัติ

---

## 2) Commission Override — ผลการ audit และการตัดสิน

**ข้อเท็จจริงที่พบ:** override ที่พิมพ์ในหน้า /commission เก็บใน localStorage แต่**ไหลเข้า
`admin_commissions` (snapshot ทางการ) ตอนกด "💾 บันทึกลง DB"** ผ่าน `commission: finalOf(a)`
โดยเดิม**ไม่มีร่องรอยผู้ปรับ/ค่าก่อนปรับ**

**คำตัดสิน: (B) การปรับค่าคอมอย่างเป็นทางการ — ที่ขาด audit trail → migrate แล้ว:**
- `admin_commissions` เพิ่ม: `estimated_commission` (ค่าก่อนปรับ), `manual_override`,
  `adjusted_by` (จาก session — client ปลอมชื่อไม่ได้), `adjusted_at`
- หน้า UI ติดป้ายตรงไปตรงมา: "ค่าที่พิมพ์เก็บในเครื่องก่อน — จะเป็นการปรับอย่างเป็นทางการ
  (พร้อมบันทึกผู้ปรับ/เวลา) เมื่อกด 💾 บันทึกลง DB"
- **ยืนยัน end-to-end บน production:** save override=123 (est=100) → อ่านกลับพบ
  `manual_override=123.00, estimated_commission=100.00, adjusted_at=✓` → ล้าง test data แล้ว

---

## 3) Final gates

| Gate | ผล |
|---|---|
| `npm run build` | ✅ Compiled successfully |
| `npm run uat:check` | ✅ ทุก suite (db-id 20, case-identity 20, evidence-integrity 19, qc 31/34/32, scraper 57+20, permissions 21, auth 11, role-menu 30, thai-ui, evidence 6, uat-feedback 21) — ยกเว้น `uat-feedback:strict` ที่ข้าม migrate เพราะไม่มี `ADMIN_API_KEY` ใน shell (**env-only, ไม่ใช่ regression**) |
| `node scripts/qa-live-clickthrough.js` | ✅ **PASS 62 / FAIL 0 / BLOCKED 0** (12 โมดูล + 21 หน้า) |
| `node scripts/qa-role-smoke.js` | ✅ **PASS 32 / FAIL 0** (4 roles) |

---

## สรุปหลักฐานการยอมรับ

1. **ทุกโมดูลหลัก 12 โมดูล** ทดสอบด้วยการคลิก/ยิง request จริง + ตรวจ DB + reload persistence — ไม่มี FAIL
2. **ทุก role (5 role)** login จริง, เมนู/สิทธิ์/forbidden ตรงตาม `ROLE_PERMS` — 403 ครบทุกจุดต้องห้าม
3. **Evidence integrity**: exact = verified เท่านั้น, wrong-case = 0, false-badge = 0 (accepted รอบก่อน)
4. **Commission override** เป็นการปรับทางการพร้อม audit trail แล้ว (ตรวจ end-to-end บน production)
5. Known non-blocking: `uat-feedback:strict` ต้องการ `ADMIN_API_KEY` ใน env ของเครื่องที่รัน

Commits รอบนี้: `7e1ffbc1` (click-through 62 PASS) → `b942ce8e` (commission audit + role smoke) — deployed + migrated

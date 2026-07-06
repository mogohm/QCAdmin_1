// ============================================================
// lib/evidence-integrity.js — ตัวตนหลักฐานต้องตรงเคส 100% ห้ามอ้าง exact จาก locator confidence
// ------------------------------------------------------------
//   ใช้ร่วม: /api/case-evidence (identity_check), scraper (post-capture verification),
//   audit script, และ test — จึงเขียนเป็น CommonJS
//   หลักการ:
//     - locator_confidence (หา bubble เจอ) ≠ evidence_verification (ภาพคือคู่ของเคสนี้จริง)
//     - exact ได้เมื่อ: identity ครบ + post-capture text hash ตรง + verification_status=verified
// ============================================================
const crypto = require("crypto");

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();

// hash ข้อความแบบ normalize (16 hex) — ใช้เทียบ "ข้อความที่ถ่ายได้จริง" กับ "ข้อความที่คาดหวัง"
function textHash(s) {
  return crypto.createHash("sha256").update(norm(s), "utf8").digest("hex").slice(0, 16);
}

const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const sameSet = (a, b) => {
  const A = asArray(a).map(String).sort();
  const B = asArray(b).map(String).sort();
  return A.length === B.length && A.every((x, i) => x === B[i]);
};

// PHASE 2/3 — identity check ระหว่าง "เคสที่เปิด" กับ "หลักฐาน 1 แถว"
//   mandatory: qc_score_id + conversation; case_ref/message ids ตรวจเมื่อมีข้อมูลทั้งสองฝั่ง
function buildIdentityCheck(selectedCase, ev) {
  const sc = selectedCase || {};
  const qc_score_match = !!(sc.qc_score_id && ev.qc_score_id && String(ev.qc_score_id) === String(sc.qc_score_id));
  const case_ref_match = sc.case_ref && ev.case_ref ? ev.case_ref === sc.case_ref : qc_score_match; // ไม่มี ref ทั้งคู่ → พึ่ง qc id
  const conversation_match = sc.conversation_id && ev.conversation_id
    ? String(ev.conversation_id) === String(sc.conversation_id)
    : true;
  const evCust = ev.customer_message_ids ?? ev.customer_message_id;
  const evAdmin = ev.admin_message_ids ?? ev.admin_message_id;
  const scCust = sc.customer_message_ids ?? sc.customer_message_id;
  const scAdmin = sc.admin_message_ids ?? sc.admin_message_id;
  // message ids: หลักฐานอาจเก็บ single id — ต้องเป็น subset ของ ids ของเคส
  const subset = (evIds, scIds) => {
    const E = asArray(evIds).map(String);
    const S = asArray(scIds).map(String);
    if (!E.length || !S.length) return null; // ข้อมูลไม่ครบ → ตัดสินไม่ได้
    return E.every((x) => S.includes(x));
  };
  const cm = subset(evCust, scCust);
  const am = subset(evAdmin, scAdmin);
  const customer_message_match = cm === null ? false : cm; // ข้อมูลไม่ครบ = ไม่ผ่าน (ห้ามอ้าง exact)
  const admin_message_match = am === null ? false : am;
  const all_match =
    qc_score_match && case_ref_match && conversation_match && customer_message_match && admin_message_match;
  return { qc_score_match, case_ref_match, conversation_match, customer_message_match, admin_message_match, all_match };
}

// PHASE 5 — post-capture verification: ภาพที่ถ่าย "อ่านข้อความจาก DOM ตอนถ่ายจริง" ต้องตรงคู่ที่คาดหวัง
//   expectedPair: { qc_score_id, case_ref, customer_message_ids, admin_message_ids,
//                   customer_texts[], admin_texts[], customer_created_at, admin_created_at }
//   captureManifest: { qc_score_id, case_ref, expected_*, captured_customer_texts, captured_admin_texts, captured_at }
function verifyCapturedEvidence({ expectedPair, captureManifest }) {
  const failures = [];
  const ep = expectedPair || {};
  const cm = captureManifest || {};

  // 1-2) identity
  if (!ep.qc_score_id || String(cm.qc_score_id) !== String(ep.qc_score_id)) failures.push("qc_score_id_mismatch");
  if (ep.case_ref && cm.case_ref && cm.case_ref !== ep.case_ref) failures.push("case_ref_mismatch");
  // 3-4) message ids
  if (!sameSet(cm.expected_customer_message_ids, ep.customer_message_ids)) failures.push("customer_message_ids_mismatch");
  if (!sameSet(cm.expected_admin_message_ids, ep.admin_message_ids)) failures.push("admin_message_ids_mismatch");
  const identity_score = failures.length === 0 ? 100 : Math.max(0, 100 - failures.length * 25);

  // 5-6) text hashes: ข้อความที่ "ถ่ายได้จริงจาก DOM" ต้องครอบทุกข้อความที่คาดหวัง
  const expCustHashes = asArray(ep.customer_texts).map(textHash);
  const expAdminHashes = asArray(ep.admin_texts).map(textHash);
  const capCustHashes = asArray(cm.captured_customer_texts).map(textHash);
  const capAdminHashes = asArray(cm.captured_admin_texts).map(textHash);
  const cover = (exp, cap) => (exp.length ? exp.filter((h) => cap.includes(h)).length / exp.length : 0);
  const custCover = cover(expCustHashes, capCustHashes);
  const adminCover = cover(expAdminHashes, capAdminHashes);
  if (custCover < 1) failures.push("customer_text_hash_mismatch");
  if (adminCover < 1) failures.push("admin_text_hash_mismatch");
  const text_score = Math.round(((custCover + adminCover) / 2) * 100);

  // 7) timestamp: manifest ต้องถ่ายหลังรู้คู่ (captured_at มีจริง) — ค่าเวลา bubble เทียบใน locate แล้ว
  const timestamp_score = cm.captured_at ? 100 : 0;
  if (!cm.captured_at) failures.push("missing_captured_at");

  const verified = failures.length === 0;
  return { verified, identity_score, text_score, timestamp_score, failures };
}

module.exports = { textHash, buildIdentityCheck, verifyCapturedEvidence, sameSet, norm };

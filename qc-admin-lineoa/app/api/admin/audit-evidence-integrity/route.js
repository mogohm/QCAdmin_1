// ============================================================
// POST /api/admin/audit-evidence-integrity — ตรวจ/กักกันหลักฐานที่ตัวตนไม่ตรงเคส
// ------------------------------------------------------------
//   ตรวจ (Phase 9):
//     A. case_ref ไม่ตรง qc_scores.case_ref
//     B. อ้าง qc_score_id ที่ไม่มีจริง
//     C. conversation ไม่ตรงกับ conversation ของ qc_score
//     D. manifest message ids ไม่ตรง qc pair ids
//     E. pair text ใน evidence ต่างจากข้อความจริงของ qc pair
//     F. url เดียวถูกใช้ข้าม qc_score หลายเคส
//     + exact ที่ยังไม่ผ่าน post-capture verification (ยังไม่กักกัน แต่รายงาน)
//   Quarantine (Phase 10, body {apply:true}):
//     mismatch (A-E) → verification_status='rejected', match_status='rejected',
//     evidence_scope='invalid_reference' — ไม่ลบ, เก็บ log ใน data_repair_logs
//   Auth: x-api-key
// ============================================================
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();

export async function POST(req) {
  if (!requireAdmin(req))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const apply = b.apply === true;
  try {
    const rows = await query`
      SELECT e.id, e.qc_score_id, e.conversation_id AS e_conv, e.case_ref AS e_ref,
             e.evidence_type, e.evidence_scope, e.match_status, e.verification_status, e.url,
             e.customer_message_id AS e_cust_id, e.admin_message_id AS e_admin_id,
             e.data->'capture_manifest' AS manifest, e.data->'pair' AS pair,
             q.id AS q_id, q.case_ref AS q_ref, q.conversation_id AS q_conv,
             q.customer_message_id AS q_cust_id, q.admin_message_id AS q_admin_id,
             q.customer_message_ids AS q_cust_ids, q.admin_message_ids AS q_admin_ids,
             m.message_text AS q_cust_text
      FROM case_evidence e
      LEFT JOIN qc_scores q ON q.id = e.qc_score_id
      LEFT JOIN messages m ON m.id = q.customer_message_id
      WHERE e.qc_score_id IS NOT NULL
        AND COALESCE(e.evidence_scope,'') <> 'invalid_reference'`; // ข้ามแถวที่กักกันแล้ว

    const bad = [];
    const counts = { total: rows.length, case_ref_mismatch: 0, qc_missing: 0, conversation_mismatch: 0, pair_ids_mismatch: 0, pair_text_mismatch: 0, manifest_missing: 0, captured_customer_hash_mismatch: 0, captured_admin_hash_mismatch: 0, exact_unverified: 0 };
    for (const r of rows) {
      const reasons = [];
      if (!r.q_id) { reasons.push("qc_missing"); counts.qc_missing++; }
      if (r.q_id && r.e_ref && r.q_ref && r.e_ref !== r.q_ref) { reasons.push("case_ref_mismatch"); counts.case_ref_mismatch++; }
      if (r.q_id && r.e_conv && r.q_conv && String(r.e_conv) !== String(r.q_conv)) { reasons.push("conversation_mismatch"); counts.conversation_mismatch++; }
      // D: manifest expected ids ⊄ qc ids
      const man = r.manifest || {};
      const qCust = (Array.isArray(r.q_cust_ids) ? r.q_cust_ids : r.q_cust_id ? [r.q_cust_id] : []).map(String);
      const qAdmin = (Array.isArray(r.q_admin_ids) ? r.q_admin_ids : r.q_admin_id ? [r.q_admin_id] : []).map(String);
      const eCust = (Array.isArray(man.expected_customer_message_ids) ? man.expected_customer_message_ids : r.e_cust_id ? [r.e_cust_id] : []).map(String);
      const eAdmin = (Array.isArray(man.expected_admin_message_ids) ? man.expected_admin_message_ids : r.e_admin_id ? [r.e_admin_id] : []).map(String);
      if (r.q_id && eCust.length && qCust.length && !eCust.every((x) => qCust.includes(x))) { reasons.push("pair_ids_mismatch"); counts.pair_ids_mismatch++; }
      else if (r.q_id && eAdmin.length && qAdmin.length && !eAdmin.every((x) => qAdmin.includes(x))) { reasons.push("pair_ids_mismatch"); counts.pair_ids_mismatch++; }
      // E: pair text vs ข้อความจริงของ qc (เทียบ customer หลัก)
      const pairCust = norm(r.pair?.customer_text || "");
      if (r.q_id && pairCust && r.q_cust_text && !pairCust.includes(norm(r.q_cust_text).slice(0, 40)) && !norm(r.q_cust_text).includes(pairCust.slice(0, 40))) {
        reasons.push("pair_text_mismatch"); counts.pair_text_mismatch++;
      }
      // F: pair_focus ที่อ้าง exact/verified ต้องมี capture_manifest
      const isPairShot = r.evidence_type === "pair_focus_png";
      if (isPairShot && r.match_status === "exact" && !r.manifest) { reasons.push("manifest_missing"); counts.manifest_missing++; }
      // G/H: hash ของข้อความที่ "ถ่ายได้จริง" ต้องครอบข้อความที่คาดหวัง (ตรวจซ้ำจาก manifest ที่เก็บไว้)
      if (man && man.captured_customer_text_hashes && man.expected_customer_text_hashes) {
        const cov = (exp, cap) => (exp || []).every((h) => (cap || []).includes(h));
        const gOk = cov(man.expected_customer_text_hashes, man.captured_customer_text_hashes);
        const hOk = cov(man.expected_admin_text_hashes, man.captured_admin_text_hashes);
        // อันตรายเฉพาะเมื่อแถวยังอ้าง verified/exact ทั้งที่ hash ไม่ตรง
        if (!gOk && r.verification_status === "verified") { reasons.push("captured_customer_hash_mismatch"); counts.captured_customer_hash_mismatch++; }
        if (!hOk && r.verification_status === "verified") { reasons.push("captured_admin_hash_mismatch"); counts.captured_admin_hash_mismatch++; }
      }
      if (r.match_status === "exact" && r.verification_status !== "verified") counts.exact_unverified++;
      if (reasons.length) bad.push({ id: r.id, type: r.evidence_type, e_ref: r.e_ref, q_ref: r.q_ref, reasons });
    }

    // F: url ถูกใช้ข้ามหลาย qc_score
    const reused = await query`
      SELECT url, count(DISTINCT qc_score_id)::int n FROM case_evidence
      WHERE url IS NOT NULL AND qc_score_id IS NOT NULL AND length(url) < 500
      GROUP BY url HAVING count(DISTINCT qc_score_id) > 1 LIMIT 20`.catch(() => []);

    const legacyCount =
      (await query`SELECT count(*)::int n FROM case_evidence WHERE evidence_scope='conversation_reference' OR match_status='legacy_unlinked'`)[0]?.n ?? 0;
    const verifiedExact =
      (await query`SELECT count(*)::int n FROM case_evidence WHERE match_status='exact' AND verification_status='verified'`)[0]?.n ?? 0;
    // breakdown รวมทั้งตาราง (ไม่จำกัดเฉพาะแถวที่มี qc linkage)
    const breakdown = (await query`SELECT
        count(*)::int AS total_all,
        count(*) FILTER (WHERE match_status='exact')::int AS exact,
        count(*) FILTER (WHERE verification_status='verified')::int AS verified,
        count(*) FILTER (WHERE match_status='exact' AND COALESCE(verification_status,'') <> 'verified')::int AS exact_not_verified,
        count(*) FILTER (WHERE verification_status='rejected' OR match_status='rejected')::int AS rejected,
        count(*) FILTER (WHERE evidence_scope='conversation_reference' OR match_status='legacy_unlinked')::int AS legacy
      FROM case_evidence`)[0] || {};

    let quarantined = 0;
    let demoted = 0;
    if (apply) {
      // J: แถวที่อ้าง exact แต่ไม่เคยผ่าน post-capture verification (ก่อนมี manifest)
      //   → ลดเป็น uncertain (ไม่ใช่ rejected — ภาพเป็นของเคสตัวเองแต่ยืนยันไม่ได้) + log
      const stale = await query`SELECT id, case_ref FROM case_evidence
        WHERE match_status='exact' AND COALESCE(verification_status,'') <> 'verified'`;
      if (stale.length) {
        await query`CREATE TABLE IF NOT EXISTS data_repair_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          table_name TEXT, row_id TEXT, field TEXT,
          old_value TEXT, new_value TEXT, reason TEXT,
          created_at TIMESTAMPTZ DEFAULT now())`;
        for (const s of stale) {
          await query`INSERT INTO data_repair_logs (table_name, row_id, field, old_value, new_value, reason)
            VALUES ('case_evidence', ${String(s.id)}, 'match_status', 'exact', 'uncertain', 'exact claim without post-capture verification')`;
          await query`UPDATE case_evidence SET match_status='uncertain' WHERE id = ${s.id}::uuid`;
          demoted++;
        }
      }
    }
    if (apply && bad.length) {
      await query`CREATE TABLE IF NOT EXISTS data_repair_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_name TEXT, row_id TEXT, field TEXT,
        old_value TEXT, new_value TEXT, reason TEXT,
        created_at TIMESTAMPTZ DEFAULT now())`;
      for (const x of bad) {
        await query`INSERT INTO data_repair_logs (table_name, row_id, field, old_value, new_value, reason)
          VALUES ('case_evidence', ${String(x.id)}, 'quarantine', ${x.e_ref || null}, 'invalid_reference', ${x.reasons.join(",")})`;
        await query`UPDATE case_evidence SET verification_status='rejected', match_status='rejected', evidence_scope='invalid_reference'
          WHERE id = ${x.id}::uuid`;
        quarantined++;
      }
    }

    return Response.json({
      ok: true,
      apply,
      breakdown,
      counts: { ...counts, verified_exact: verifiedExact, legacy_unverified: legacyCount, mismatched: bad.length, reused_url: reused.length, quarantined, demoted },
      mismatched_samples: bad.slice(0, 20),
      reused_urls: reused.map((r) => ({ n: r.n, url: String(r.url).slice(0, 60) })),
    });
  } catch (e) {
    console.error("[audit-evidence-integrity]", e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

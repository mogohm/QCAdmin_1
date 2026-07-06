"use client";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import { statusLabel, intentLabel } from "@/lib/ui-labels";
import { deriveCaseRef } from "@/lib/customer-identity";

// ---- ยืนยันชื่อลูกค้า (client guard) — ถ้าดูเหมือนข้อความแชท/ระบบ → ไม่ทราบชื่อลูกค้า ----
const SERVICE_HINT =
  /(ระบบฝาก|ฝาก-ถอน|ปิดให้บริการ|ขอบคุณที่ใช้บริการ|กรุณา|แจ้งยืนยัน|ตรวจสอบแล้ว|ทำรายการ|สอบถาม|ขออภัย|โปรโมชั่น)/;
function looksLikeMessage(v) {
  const s = String(v || "");
  if (!s.trim()) return false;
  if (s.includes("\n") || s.length > 80) return true;
  if (SERVICE_HINT.test(s)) return true;
  if (/[?!？！。]/.test(s)) return true;
  if (/(ครับ|ค่ะ|คะ|นะคะ)\s*$/.test(s.trim()) && s.trim().length > 12) return true;
  return s.trim().split(/\s+/).length > 6;
}
function displayCustomerName(name) {
  const s = String(name || "").trim();
  if (!s || looksLikeMessage(s)) return "ไม่ทราบชื่อลูกค้า";
  return s;
}
// เวลาไทย: "06 ก.ค. 2026 · 02:13 น."
const TH_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function fmtBkk(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  const b = new Date(d.getTime() + 7 * 3600000); // → เวลาไทย
  const dd = String(b.getUTCDate()).padStart(2, "0");
  const mo = TH_MONTHS[b.getUTCMonth()];
  const yy = b.getUTCFullYear();
  const hh = String(b.getUTCHours()).padStart(2, "0");
  const mi = String(b.getUTCMinutes()).padStart(2, "0");
  return `${dd} ${mo} ${yy} · ${hh}:${mi} น.`;
}
const clip = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
};
// รหัสเคสอ่านง่าย: ใช้ case_ref ถ้ามี ไม่งั้น derive จาก qc_score_id + วันที่
function caseRef(r) {
  if (r.case_ref) return r.case_ref;
  const src = r.qc_score_id || r.id;
  if (!src) return "—";
  return deriveCaseRef({ sourceId: src, createdAt: r.customer_created_at || r.created_at });
}

// AI Review Queue — เคสที่ AI ไม่มั่นใจ/ไม่เข้าใจ ให้หัวหน้าตรวจ + แก้ + สร้าง SOP ให้ AI เรียนรู้
export default function AiReview() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("pending");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(null); // เคสที่เปิดตรวจ
  const [sop, setSop] = useState({ topic: "", answer: "", intent: "" });

  const load = () => {
    setLoading(true);
    setErr("");
    fetch(`/api/ai-review?status=${status}`)
      .then((r) =>
        r.ok
          ? r.json()
          : r.json().then((j) => Promise.reject(j.error || r.status)),
      )
      .then((d) => setItems(d.items || []))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, [status]);

  const review = async (r, action, extra = {}) => {
    const res = await fetch(`/api/ai-review/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const j = await res.json();
    if (!res.ok) return alert(j.error || "error");
    setSel(null);
    load();
  };
  const createSop = async (r) => {
    if (!sop.topic || !sop.answer) return alert("กรอกหัวข้อและคำตอบ");
    const res = await fetch(`/api/ai-review/${r.id}/create-sop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sop),
    });
    const j = await res.json();
    if (!res.ok) return alert(j.error || "error");
    alert("สร้าง SOP จากเคสนี้แล้ว — AI จะเรียนรู้เพิ่ม");
    setSel(null);
    setSop({ topic: "", answer: "", intent: "" });
    load();
  };

  const actions = (
    <select
      value={status}
      onChange={(e) => setStatus(e.target.value)}
      style={{ width: 170, margin: 0 }}
    >
      <option value="pending">รอตรวจ</option>
      <option value="approved">อนุมัติแล้ว</option>
      <option value="corrected">แก้ไขแล้ว</option>
      <option value="not_relevant">ไม่เกี่ยว QC</option>
      <option value="all">ทั้งหมด</option>
    </select>
  );

  return (
    <AppShell
      title="AI Review Queue"
      subtitle="เคสที่ AI ไม่มั่นใจ — ให้หัวหน้าตรวจสอบและสอน AI"
      actions={actions}
    >
      <div
        style={{
          fontSize: 12,
          color: "#8fb0dd",
          marginBottom: 10,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <a href="/" style={{ color: "#5fd0ff", textDecoration: "none" }}>
          ← กลับ Dashboard
        </a>
        <span style={{ color: "#3a557d" }}>|</span>
        <span className="muted">หน้าหลัก / AI Review Queue</span>
      </div>
      <div
        className="glass"
        style={{ marginBottom: 12, fontSize: 13, color: "#bcd2f4" }}
      >
        หน้านี้เก็บเคสที่ AI ไม่เข้าใจ/ไม่มั่นใจ (ไม่พบ SOP, คะแนนต่ำ, intent
        ไม่ชัด) เพื่อให้ QC/หัวหน้าตรวจสอบ อนุมัติผล หรือแก้ไข และ
        <b>สร้าง SOP จากเคส</b> เพื่อให้ AI เรียนรู้เพิ่มเติม
      </div>
      {err ? (
        <div className="glass glow empty" style={{ color: "#f6c65b" }}>
          🔒{" "}
          {err === "forbidden"
            ? "ไม่มีสิทธิ์ (qc.dispute.review / qc.score.override)"
            : err}
        </div>
      ) : (
        <div className="glass">
          <table className="table">
            <thead>
              <tr>
                <th>วันที่/เวลา</th>
                <th>รหัสเคส</th>
                <th>ลูกค้า</th>
                <th>แอดมิน</th>
                <th>คำถามย่อ</th>
                <th>เหตุผลที่ส่งตรวจ</th>
                <th>ความมั่นใจ</th>
                <th>หลักฐาน</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="10" className="empty">
                    <span className="spin">⏳</span> โหลด...
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((r) => {
                  const hasImg = (r.evidence_count ?? r.has_screenshot) ? true : false;
                  return (
                    <tr key={r.id}>
                      <td style={{ fontSize: 11, whiteSpace: "nowrap", color: "#8fb0dd" }}>
                        {fmtBkk(r.customer_created_at || r.created_at)}
                      </td>
                      <td style={{ fontSize: 11, fontFamily: "monospace", color: "#5fd0ff" }}>
                        {caseRef(r)}
                      </td>
                      <td
                        style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={displayCustomerName(r.customer_name)}
                      >
                        {displayCustomerName(r.customer_name)}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{r.admin_name || "—"}</td>
                      <td
                        className="muted"
                        style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}
                        title={r.customer_text || ""}
                      >
                        {clip(r.customer_text, 60) || "—"}
                      </td>
                      <td className="muted" style={{ fontSize: 12, maxWidth: 200 }}>
                        {r.reason}
                      </td>
                      <td className={r.sop_confidence < 60 ? "score bad" : "muted"}>
                        {r.sop_confidence != null ? r.sop_confidence + "%" : "—"}
                      </td>
                      <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                        {hasImg ? "📷 มีภาพ" : <span className="muted">ไม่มีภาพ</span>}
                      </td>
                      <td>
                        <span
                          className={`score ${r.status === "pending" ? "warn" : r.status === "not_relevant" ? "bad" : "good"}`}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button onClick={() => setSel(r)} style={{ padding: "3px 8px", fontSize: 11 }}>
                          ตรวจ
                        </button>
                      </td>
                    </tr>
                  );
                })}
              {!loading && !items.length && (
                <tr>
                  <td colSpan="10" className="empty">
                    ไม่มีเคสในคิว
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {sel && (
        <div
          onClick={() => setSel(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,8,25,.72)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            className="glass glow"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 640,
              maxWidth: "96vw",
              maxHeight: "90vh",
              overflow: "auto",
            }}
          >
            <h3 style={{ marginTop: 0 }}>ตรวจเคส AI</h3>
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                fontSize: 12,
                marginBottom: 10,
                paddingBottom: 8,
                borderBottom: "1px solid #26406b",
              }}
            >
              <span style={{ fontFamily: "monospace", color: "#5fd0ff" }}>
                {caseRef(sel)}
              </span>
              <span style={{ color: "#8fb0dd" }}>
                🕒 {fmtBkk(sel.customer_created_at || sel.created_at)}
              </span>
              <span style={{ color: "#eaf2ff" }}>
                👤 {displayCustomerName(sel.customer_name)}
              </span>
              {sel.admin_name && (
                <span style={{ color: "#8fb0dd" }}>🧑‍💼 {sel.admin_name}</span>
              )}
              <span className="badge">{intentLabel(sel.detected_intent)}</span>
            </div>
            <div className="case" style={{ fontSize: 13 }}>
              <div>
                ข้อความลูกค้า:{" "}
                <b style={{ color: "#eaf2ff" }}>{sel.customer_text || "—"}</b>
              </div>
              <div>
                ข้อความแอดมิน:{" "}
                <b style={{ color: "#eaf2ff" }}>{sel.admin_text || "—"}</b>
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                เหตุผลที่เข้าคิว: {sel.reason}
              </div>
              <div className="muted">
                SOP ที่เดา: {sel.matched_sop_topic || "— ไม่พบ —"}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                margin: "12px 0",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => review(sel, "approve")}
                style={{ background: "#16a34a" }}
              >
                ✓ อนุมัติผล AI
              </button>
              <button
                onClick={() => review(sel, "not_relevant")}
                style={{ background: "#64748b" }}
              >
                ไม่เกี่ยว QC
              </button>
              <button
                onClick={() => {
                  const note = prompt(
                    "แก้ intent เป็น (เว้นว่างถ้าไม่แก้):",
                    sel.detected_intent || "",
                  );
                  if (note !== null)
                    review(sel, "correct", { corrected_intent: note });
                }}
              >
                แก้ Intent
              </button>
            </div>
            <div className="panel-title">สร้าง SOP จากเคสนี้ (สอน AI)</div>
            <input
              placeholder="หัวข้อ SOP"
              value={sop.topic}
              onChange={(e) => setSop({ ...sop, topic: e.target.value })}
            />
            <input
              placeholder="intent (เช่น poker/deposit)"
              value={sop.intent}
              onChange={(e) => setSop({ ...sop, intent: e.target.value })}
            />
            <textarea
              placeholder="คำตอบที่ถูกต้อง"
              value={sop.answer}
              onChange={(e) => setSop({ ...sop, answer: e.target.value })}
              rows={3}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                onClick={() => createSop(sel)}
                style={{ flex: 1, background: "#0b5cab" }}
              >
                💾 สร้าง SOP + สอน AI
              </button>
              <button onClick={() => setSel(null)} className="ghost">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

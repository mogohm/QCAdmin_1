"use client";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import { statusLabel, intentLabel, categoryLabel } from "@/lib/ui-labels";
import { deriveCaseRef } from "@/lib/customer-identity";
import EvidenceViewer from "../components/EvidenceViewer";
import { IMG_EVIDENCE_TYPES as IMG_TYPES } from "@/lib/evidence-integrity";

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
  const [detail, setDetail] = useState(null); // รายละเอียดเคสเต็ม (4 แท็บ)
  const [tab, setTab] = useState("chat");
  const [showEvidence, setShowEvidence] = useState(false);

  // เปิดเคส → โหลดรายละเอียดเต็ม (timeline/วิเคราะห์/หลักฐาน/ประวัติ)
  const openCase = (r) => {
    setSel(r);
    setTab("chat");
    setDetail(null);
    fetch(`/api/ai-review/${r.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setDetail(d))
      .catch(() => setDetail(null));
  };

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
                  // ป้ายภาพ: ห้ามใช้ evidence_count (รวมข้อมูลประกอบที่ไม่ใช่ภาพ)
                  const badge =
                    (r.verified_screenshot_count ?? 0) > 0
                      ? { txt: "✅ มีภาพตรงเคส", c: "#22c55e" }
                      : (r.reference_screenshot_count ?? 0) > 0
                        ? { txt: "⚠️ มีภาพอ้างอิง", c: "#f6c65b" }
                        : { txt: "ไม่มีภาพ", c: "#8fb0dd" };
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
                      <td style={{ fontSize: 11, whiteSpace: "nowrap", color: badge.c }}>
                        {badge.txt}
                      </td>
                      <td>
                        <span
                          className={`score ${r.status === "pending" ? "warn" : r.status === "not_relevant" ? "bad" : "good"}`}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button onClick={() => openCase(r)} style={{ padding: "3px 8px", fontSize: 11 }}>
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
            {/* ---- 4 แท็บ: บทสนทนา / การวิเคราะห์ AI / หลักฐาน / ประวัติ ---- */}
            {/* หลักฐาน: นับเฉพาะ "ภาพ" บนป้ายแท็บ — ข้อมูลประกอบ (raw/summary/late) ไม่ใช่ภาพ */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {[
                ["chat", "💬 บทสนทนา"],
                ["ai", "🤖 การวิเคราะห์ AI"],
                ["evidence", (() => {
                  const ev = detail?.evidence || [];
                  const imgs = ev.filter((e) => IMG_TYPES.includes(e.evidence_type));
                  const exact = imgs.filter((e) => e.verification_status === "verified" && e.match_status === "exact").length;
                  return `📷 หลักฐาน (ภาพตรงเคส ${exact} · ประกอบ ${ev.length - imgs.length})`;
                })()],
                ["history", "🕘 ประวัติการตรวจ"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={tab === k ? "" : "ghost"}
                  style={{ padding: "4px 12px", fontSize: 12 }}
                >
                  {label}
                </button>
              ))}
            </div>

            {!detail && (
              <div className="muted" style={{ padding: 12, fontSize: 12 }}>
                <span className="spin">⏳</span> กำลังโหลดรายละเอียดเคส...
              </div>
            )}

            {/* Tab 1: บทสนทนา — timeline จริง highlight คู่ข้อความที่ใช้ให้คะแนน */}
            {detail && tab === "chat" && (
              <div style={{ maxHeight: 320, overflow: "auto", padding: 4 }}>
                {!detail.timeline?.length && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    ไม่พบบทสนทนาใน conversation นี้ — แสดงเฉพาะคู่ข้อความที่บันทึกไว้
                    <div className="case" style={{ marginTop: 8 }}>
                      <div>ลูกค้า: <b style={{ color: "#eaf2ff" }}>{sel.customer_text || "—"}</b></div>
                      <div>แอดมิน: <b style={{ color: "#eaf2ff" }}>{sel.admin_text || "—"}</b></div>
                    </div>
                  </div>
                )}
                {(detail.timeline || []).map((m) => {
                  const isPair =
                    m.id === detail.item?.customer_message_id ||
                    m.id === detail.item?.admin_message_id;
                  const isAdmin = m.direction === "admin";
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        justifyContent: isAdmin ? "flex-end" : "flex-start",
                        margin: "4px 0",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "78%",
                          fontSize: 12,
                          padding: "6px 10px",
                          borderRadius: 10,
                          background: isAdmin ? "#0b5cab" : "#1b2c4d",
                          border: isPair ? "2px solid #f6c65b" : "1px solid #26406b",
                          boxShadow: isPair ? "0 0 10px rgba(246,198,91,.35)" : "none",
                        }}
                      >
                        <div style={{ fontSize: 10, color: "#8fb0dd", marginBottom: 2 }}>
                          {isAdmin ? `🧑‍💼 ${m.admin_name || "แอดมิน"}` : "👤 ลูกค้า"} · {fmtBkk(m.created_at)}
                          {isPair && <b style={{ color: "#f6c65b" }}> ★ คู่ที่ตรวจ</b>}
                        </div>
                        {m.message_text || `[${m.message_type || "media"}]`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab 2: การวิเคราะห์ AI */}
            {detail && tab === "ai" && (
              <div style={{ fontSize: 13 }}>
                <div className="case">
                  <div>Intent: <span className="badge">{intentLabel(sel.detected_intent)}</span>
                    {sel.intent_confidence != null && <span className="muted"> ({sel.intent_confidence}%)</span>}
                  </div>
                  <div>SOP ที่เดา: <b style={{ color: "#eaf2ff" }}>{sel.matched_sop_topic || "— ไม่พบ —"}</b>
                    {sel.sop_confidence != null && <span className="muted"> · ความมั่นใจ {sel.sop_confidence}%</span>}
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>เหตุผลที่เข้าคิว: {sel.reason}</div>
                  {detail.analysis?.score && (
                    <div style={{ marginTop: 6 }}>
                      คะแนนรวม: <b style={{ color: detail.analysis.score.final_score >= 70 ? "#22c55e" : "#ef4444" }}>
                        {detail.analysis.score.final_score}
                      </b>
                      {detail.item?.response_seconds != null && (
                        <span className="muted"> · ตอบใน {detail.item.response_seconds} วินาที</span>
                      )}
                    </div>
                  )}
                </div>
                {detail.analysis?.details?.length > 0 && (
                  <table className="table" style={{ marginTop: 8, fontSize: 12 }}>
                    <thead><tr><th>มิติ</th><th>คะแนน</th><th>ผ่าน</th><th>หมายเหตุ</th></tr></thead>
                    <tbody>
                      {detail.analysis.details.map((d, i) => (
                        <tr key={i}>
                          <td>{categoryLabel(d.category_code)}</td>
                          <td>{d.weighted_score}/{d.max_score}</td>
                          <td>{d.pass === false ? "❌" : d.pass === true ? "✅" : "—"}</td>
                          <td className="muted" style={{ maxWidth: 200, fontSize: 11 }}>
                            {d.fail_reason || d.suggestion || ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab 3: หลักฐาน */}
            {detail && tab === "evidence" && (() => {
              const ev = detail.evidence || [];
              const imgs = ev.filter((e) => IMG_TYPES.includes(e.evidence_type));
              const exactImgs = imgs.filter((e) => e.verification_status === "verified" && e.match_status === "exact");
              const refImgs = imgs.length - exactImgs.length;
              const supporting = ev.length - imgs.length;
              return (
                <div style={{ fontSize: 12 }}>
                  {/* แยกให้ชัด: ภาพตรงเคส / ภาพอ้างอิง / ข้อมูลประกอบ — ห้ามเรียกข้อมูลประกอบว่า "ภาพ" */}
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "6px 8px", marginBottom: 8, background: "#12203c", borderRadius: 8, fontSize: 12 }}>
                    <span>หลักฐานทั้งหมด: <b style={{ color: "#eaf2ff" }}>{ev.length}</b></span>
                    <span>ภาพตรงเคส: <b style={{ color: exactImgs.length ? "#22c55e" : "#8fb0dd" }}>{exactImgs.length}</b></span>
                    <span>ภาพอ้างอิง: <b style={{ color: refImgs ? "#f6c65b" : "#8fb0dd" }}>{refImgs}</b></span>
                    <span>ข้อมูลประกอบ: <b style={{ color: "#8fb0dd" }}>{supporting}</b></span>
                  </div>
                  {!ev.length ? (
                    <div className="muted" style={{ padding: 8 }}>
                      ยังไม่มีหลักฐานของเคสนี้ — ดูข้อความ/เวลาได้จากแท็บบทสนทนา
                      {sel.scraper_job_id && (
                        <div style={{ marginTop: 4 }}>scraper job: <code>{sel.scraper_job_id}</code></div>
                      )}
                    </div>
                  ) : (
                    <>
                      <table className="table" style={{ fontSize: 12 }}>
                        <thead><tr><th>ประเภท</th><th>หมวด</th><th>ชื่อ</th><th>เวลา</th><th>ไฟล์</th></tr></thead>
                        <tbody>
                          {ev.map((e) => {
                            const isImg = IMG_TYPES.includes(e.evidence_type);
                            const cat = isImg
                              ? e.verification_status === "verified" && e.match_status === "exact"
                                ? { t: "ภาพตรงเคส", c: "#22c55e" }
                                : { t: "ภาพอ้างอิง", c: "#f6c65b" }
                              : { t: "ข้อมูลประกอบ", c: "#8fb0dd" };
                            return (
                              <tr key={e.id}>
                                <td><span className="badge">{e.evidence_type}</span></td>
                                <td style={{ color: cat.c, fontSize: 11, whiteSpace: "nowrap" }}>{cat.t}</td>
                                <td>{e.title || "—"}</td>
                                <td style={{ fontSize: 11 }}>{fmtBkk(e.created_at)}</td>
                                <td>{e.has_file ? "📎" : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <button
                        onClick={() => setShowEvidence(true)}
                        style={{ marginTop: 8, background: "#0b5cab" }}
                      >
                        🖼 เปิด Evidence Viewer (ภาพจริง)
                      </button>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Tab 4: ประวัติการตรวจ */}
            {detail && tab === "history" && (
              <div style={{ fontSize: 12 }}>
                {(detail.history || []).map((h, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "6px 0",
                      borderBottom: "1px solid #1b2c4d",
                    }}
                  >
                    <span style={{ color: "#8fb0dd", whiteSpace: "nowrap" }}>{fmtBkk(h.at)}</span>
                    <span style={{ color: "#eaf2ff", whiteSpace: "nowrap" }}>{statusLabel(h.action) || h.action}</span>
                    <span className="muted">โดย {h.by}</span>
                    {h.note && <span className="muted" style={{ flex: 1 }}>· {h.note}</span>}
                  </div>
                ))}
              </div>
            )}
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

      {/* Evidence Viewer — เปิดด้วย linkage ของเคสเดียวกันเป๊ะ (qc_score_id + conversation_id) */}
      {showEvidence && sel && (
        <EvidenceViewer
          qcScoreId={sel.qc_score_id}
          conversationId={sel.conversation_id}
          caseRef={caseRef(sel)}
          onClose={() => setShowEvidence(false)}
        />
      )}
    </AppShell>
  );
}

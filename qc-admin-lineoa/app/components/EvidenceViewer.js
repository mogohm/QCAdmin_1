"use client";
import { useEffect, useState } from "react";

// Evidence Viewer — drawer แสดงหลักฐานของเคส (เรียกจาก Chat Review / QC Monitoring)
//   props: { qcScoreId?, conversationId?, caseRef?, onClose }
const TYPE_LABEL = {
  chat_text: "💬 บทสนทนา",
  raw_json: "🧾 ผล QC (raw)",
  late_response: "⏱️ ตอบช้ากว่า SLA",
  screenshot: "🖼️ ภาพหน้าจอ",
  html: "📄 HTML ต้นฉบับ",
  sop: "📚 SOP",
  system: "🛠️ ระบบ",
  timestamp: "🕐 เวลา",
};

export default function EvidenceViewer({
  qcScoreId,
  conversationId,
  caseRef,
  onClose,
}) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const qs = new URLSearchParams();
    if (qcScoreId) qs.set("qc_score_id", qcScoreId);
    if (conversationId) qs.set("conversation_id", conversationId);
    fetch(`/api/case-evidence?${qs.toString()}`)
      .then((r) =>
        r.ok
          ? r.json()
          : r.json().then((j) => Promise.reject(j.error || r.status)),
      )
      .then((d) => setRows(d.evidence || []))
      .catch((e) => setErr(String(e)));
  }, [qcScoreId, conversationId]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,8,25,.72)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 1200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass"
        style={{
          width: 460,
          maxWidth: "94vw",
          height: "100%",
          overflow: "auto",
          borderRadius: 0,
          padding: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3 style={{ margin: 0 }}>🔍 หลักฐานของเคส</h3>
          <button onClick={onClose} className="ghost" style={{ fontSize: 12 }}>
            ปิด
          </button>
        </div>
        {caseRef && (
          <div
            className="muted"
            style={{ fontSize: 11, marginBottom: 8, wordBreak: "break-all" }}
          >
            อ้างอิงเคส:{" "}
            <code
              onClick={() => navigator.clipboard?.writeText(caseRef)}
              style={{ cursor: "pointer" }}
              title="คลิกเพื่อคัดลอก"
            >
              {caseRef}
            </code>
          </div>
        )}
        {err && (
          <div className="empty" style={{ color: "#f6c65b" }}>
            🔒 {err === "forbidden" ? "ไม่มีสิทธิ์ดูหลักฐาน" : err}
          </div>
        )}
        {!err && rows === null && (
          <div className="empty">
            <span className="spin">⏳</span> โหลดหลักฐาน...
          </div>
        )}
        {!err && rows && !rows.length && (
          <div className="empty">ยังไม่มีหลักฐานสำหรับเคสนี้</div>
        )}
        {!err &&
          (rows || []).map((ev) => (
            <div
              key={ev.id}
              className="case"
              style={{ marginBottom: 10, padding: 12 }}
            >
              <div
                style={{ fontWeight: 700, color: "#cfe0ff", marginBottom: 4 }}
              >
                {TYPE_LABEL[ev.evidence_type] || ev.evidence_type}{" "}
                <span className="muted" style={{ fontWeight: 400 }}>
                  · {ev.title || ""}
                </span>
              </div>
              {ev.evidence_type === "chat_text" && (
                <div style={{ fontSize: 13 }}>
                  <div style={{ color: "#9fb3d6" }}>
                    ลูกค้า:{" "}
                    <span style={{ color: "#eaf2ff" }}>
                      {ev.data?.customer_text || "—"}
                    </span>
                  </div>
                  <div style={{ color: "#9fb3d6" }}>
                    แอดมิน:{" "}
                    <span style={{ color: "#eaf2ff" }}>
                      {ev.data?.admin_text || "—"}
                    </span>
                  </div>
                </div>
              )}
              {ev.evidence_type === "late_response" && (
                <div style={{ fontSize: 13, color: "#ffb4b4" }}>
                  ใช้เวลา {Math.round((ev.data?.response_seconds || 0) / 60)}{" "}
                  นาที (เกิน SLA{" "}
                  {Math.round((ev.data?.sla_limit_seconds || 0) / 60)} นาที)
                </div>
              )}
              {ev.file_path && (
                <div style={{ fontSize: 12 }}>
                  ไฟล์:{" "}
                  <code style={{ wordBreak: "break-all" }}>{ev.file_path}</code>
                </div>
              )}
              {ev.url && (
                <a
                  href={ev.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#5fd0ff", fontSize: 12 }}
                >
                  เปิดลิงก์หลักฐาน
                </a>
              )}
              {["raw_json", "system"].includes(ev.evidence_type) && ev.data && (
                <pre
                  style={{
                    fontSize: 11,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: "#bcd2f4",
                    margin: "4px 0 0",
                  }}
                >
                  {JSON.stringify(ev.data, null, 2)}
                </pre>
              )}
              <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>
                {ev.created_at
                  ? new Date(ev.created_at).toLocaleString("th-TH")
                  : ""}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

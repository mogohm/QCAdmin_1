"use client";
import { useEffect, useMemo, useState } from "react";
import { formatDuration, categoryLabel, safeText } from "@/lib/ui-labels";

// Evidence Viewer — Evidence Bundle ของเคส (4 แท็บ: ภาพแชทจริง / บทสนทนายาว / สรุปเคส / ข้อมูลดิบ)
//   props: { qcScoreId?, conversationId?, caseRef?, onClose }
const PART_TYPES = ["chat_part_png", "chat_long_png"];

export default function EvidenceViewer({
  qcScoreId,
  conversationId,
  caseRef,
  onClose,
}) {
  const [bundle, setBundle] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("shots");
  const [zoom, setZoom] = useState(null); // url ของภาพที่ขยาย

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
      .then(setBundle)
      .catch((e) => setErr(String(e)));
  }, [qcScoreId, conversationId]);

  const shots = bundle?.screenshots || [];
  const mainShots = useMemo(
    () => shots.filter((s) => !PART_TYPES.includes(s.type)),
    [shots],
  );
  const partShots = useMemo(
    () => shots.filter((s) => PART_TYPES.includes(s.type)),
    [shots],
  );
  const summary = bundle?.summary || null;
  const timeline = bundle?.timeline || null;

  const TABS = [
    [
      "shots",
      `🖼️ ภาพแชทจริง${mainShots.length ? ` (${mainShots.length})` : ""}`,
    ],
    [
      "parts",
      `📜 บทสนทนายาว${partShots.length ? ` (${partShots.length})` : ""}`,
    ],
    ["summary", "📋 สรุปเคส"],
    ["raw", "🧾 ข้อมูลดิบ / HTML"],
  ];

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
          width: 560,
          maxWidth: "96vw",
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
            style={{ fontSize: 11, marginBottom: 6, wordBreak: "break-all" }}
          >
            อ้างอิงเคส:{" "}
            <code
              onClick={() => navigator.clipboard?.writeText(caseRef)}
              style={{ cursor: "pointer" }}
              title="คลิกเพื่อคัดลอก"
            >
              {caseRef}
            </code>
            {bundle?.masked && (
              <span className="muted"> · 🔒 ปิดบังข้อมูลลูกค้าบางส่วน</span>
            )}
          </div>
        )}

        {err && (
          <div className="empty" style={{ color: "#f6c65b" }}>
            🔒 {err === "forbidden" ? "ไม่มีสิทธิ์ดูหลักฐาน" : err}
          </div>
        )}
        {!err && !bundle && (
          <div className="empty">
            <span className="spin">⏳</span> โหลดหลักฐาน...
          </div>
        )}

        {!err && bundle && (
          <>
            {/* tabs */}
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                margin: "10px 0 12px",
              }}
            >
              {TABS.map(([k, label]) => (
                <span
                  key={k}
                  className={`chip ${tab === k ? "on" : ""}`}
                  onClick={() => setTab(k)}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Tab 1: ภาพแชทจริง */}
            {tab === "shots" &&
              (mainShots.length ? (
                <Gallery items={mainShots} onZoom={setZoom} />
              ) : (
                <div className="empty" style={{ color: "#8fb0dd" }}>
                  ยังไม่มีภาพหลักฐานของหน้าแชทสำหรับเคสนี้
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    (scraper จะแคปภาพแชทจริงเมื่อรันเก็บข้อมูลรอบถัดไป — โหมด
                    flagged_only เก็บเฉพาะเคสที่มีปัญหา)
                  </div>
                </div>
              ))}

            {/* Tab 2: บทสนทนาแบบยาว */}
            {tab === "parts" &&
              (partShots.length ? (
                <Gallery items={partShots} onZoom={setZoom} />
              ) : (
                <div className="empty" style={{ color: "#8fb0dd" }}>
                  ยังไม่มีภาพบทสนทนาแบบยาวสำหรับเคสนี้
                </div>
              ))}

            {/* Tab 3: สรุปเคส */}
            {tab === "summary" && (
              <SummaryTab
                summary={summary}
                timeline={timeline}
                rawData={bundle.rawData}
              />
            )}

            {/* Tab 4: ข้อมูลดิบ / HTML */}
            {tab === "raw" && (
              <RawTab
                rawData={bundle.rawData}
                htmlSnapshots={bundle.htmlSnapshots}
              />
            )}
          </>
        )}

        {/* lightbox ขยายภาพ */}
        {zoom && (
          <div
            onClick={() => setZoom(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.85)",
              display: "grid",
              placeItems: "center",
              zIndex: 1300,
              padding: 20,
            }}
          >
            <img
              src={zoom}
              alt="evidence"
              style={{
                maxWidth: "94vw",
                maxHeight: "94vh",
                borderRadius: 8,
                boxShadow: "0 0 40px #000",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Gallery({ items, onZoom }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {items.map((s) =>
        s.url ? (
          <div key={s.id} className="case" style={{ padding: 6 }}>
            <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>
              {s.title || s.type}
            </div>
            <img
              src={s.url}
              alt={s.title || s.type}
              onClick={() => onZoom(s.url)}
              style={{
                width: "100%",
                borderRadius: 6,
                cursor: "zoom-in",
                border: "1px solid #21406e",
              }}
            />
          </div>
        ) : (
          <div key={s.id} className="case" style={{ padding: 8, fontSize: 12 }}>
            <div className="muted">{s.title || s.type}</div>
            {s.file_path && (
              <code style={{ fontSize: 10, wordBreak: "break-all" }}>
                {s.file_path}
              </code>
            )}
            <div className="muted" style={{ fontSize: 10 }}>
              (ไฟล์อยู่บนเครื่อง scraper — ไม่มีภาพ inline)
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 13 }}>
      <span className="muted" style={{ width: 120, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ color: "#eaf2ff" }}>{value ?? "—"}</span>
    </div>
  );
}

function SummaryTab({ summary, timeline, rawData }) {
  // fallback: ถ้าไม่มี summary_json ใช้ chat_text
  const chat = (rawData || []).find((r) => r.type === "chat_text")?.data;
  const s = summary || {};
  const cust = s.customer_text || chat?.customer_text;
  const adm = s.admin_text || chat?.admin_text;
  if (!summary && !chat)
    return (
      <div className="empty" style={{ color: "#8fb0dd" }}>
        ยังไม่มีข้อมูลสรุปสำหรับเคสนี้
      </div>
    );
  const fmtTs = (t) => (t ? new Date(t).toLocaleString("th-TH") : "—");
  return (
    <div className="case" style={{ padding: 14 }}>
      <Row label="ลูกค้า" value={s.customer_name} />
      <Row label="แอดมิน" value={s.admin_name} />
      <div
        style={{
          margin: "8px 0",
          padding: 10,
          background: "#0e1c33",
          borderRadius: 8,
        }}
      >
        <div style={{ color: "#9fb3d6", fontSize: 12 }}>
          ❓ ข้อความลูกค้า (ที่ให้คะแนน):
        </div>
        <div style={{ color: "#eaf2ff", fontSize: 13, marginTop: 2 }}>
          {cust || "—"}
        </div>
        <div style={{ color: "#9fb3d6", fontSize: 12, marginTop: 8 }}>
          💬 คำตอบแอดมิน:
        </div>
        <div style={{ color: "#eaf2ff", fontSize: 13, marginTop: 2 }}>
          {adm || "—"}
        </div>
      </div>
      <Row
        label="เวลาลูกค้าถาม"
        value={fmtTs(timeline?.customer_ts || s.customer_created_at)}
      />
      <Row
        label="เวลาแอดมินตอบ"
        value={fmtTs(timeline?.admin_ts || s.admin_created_at)}
      />
      <Row
        label="เวลาตอบ"
        value={
          (timeline?.response_seconds ?? s.response_seconds) != null
            ? formatDuration(timeline?.response_seconds ?? s.response_seconds)
            : "—"
        }
      />
      <Row
        label="คะแนน QC"
        value={
          s.final_score != null ? (
            <b
              className={`score ${s.final_score >= 85 ? "good" : s.final_score >= 70 ? "warn" : "bad"}`}
            >
              {s.final_score}
            </b>
          ) : (
            "—"
          )
        }
      />
      <Row
        label="ประเภท/intent"
        value={
          s.is_fatal
            ? "ผิดร้ายแรง"
            : categoryLabel(s.intent) !== "-"
              ? categoryLabel(s.intent)
              : s.intent
        }
      />
      <Row label="SOP ที่ match" value={s.matched_sop_topic} />
      <Row
        label="เหตุผล AI"
        value={s.score_reason ? safeText(s.score_reason) : "—"}
      />
    </div>
  );
}

function RawTab({ rawData, htmlSnapshots }) {
  const has = (rawData || []).length || (htmlSnapshots || []).length;
  if (!has)
    return (
      <div className="empty" style={{ color: "#8fb0dd" }}>
        ยังไม่มีข้อมูลดิบสำหรับเคสนี้
      </div>
    );
  return (
    <div>
      {(htmlSnapshots || []).map((h) => (
        <div
          key={h.id}
          className="case"
          style={{ marginBottom: 8, padding: 10, fontSize: 12 }}
        >
          <b style={{ color: "#cfe0ff" }}>📄 {h.title || "HTML snapshot"}</b>
          {h.file_path && (
            <div
              className="muted"
              style={{ fontSize: 10, wordBreak: "break-all" }}
            >
              ไฟล์: {h.file_path}
            </div>
          )}
          {h.html && (
            <pre
              style={{
                fontSize: 10,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "#bcd2f4",
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {String(h.html).slice(0, 4000)}
            </pre>
          )}
        </div>
      ))}
      {(rawData || []).map((r) => (
        <div
          key={r.id}
          className="case"
          style={{ marginBottom: 8, padding: 10 }}
        >
          <b style={{ color: "#cfe0ff", fontSize: 12 }}>{r.title || r.type}</b>
          <pre
            style={{
              fontSize: 10,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "#bcd2f4",
              margin: "4px 0 0",
              maxHeight: 220,
              overflow: "auto",
            }}
          >
            {JSON.stringify(r.data, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

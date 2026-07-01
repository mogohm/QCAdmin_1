"use client";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import ChatModal from "../components/ChatModal";
import EvidenceViewer from "../components/EvidenceViewer";
import { ScoringCriteriaButton } from "../components/ScoringCriteriaPanel";

const toISO = (d) => d.toISOString().slice(0, 10);
const sc = (v) => (v >= 85 ? "good" : v >= 70 ? "warn" : "bad");

// ตัวกรองเคส (ทำงานฝั่ง client จากผลที่โหลดมา)
const FILTERS = [
  ["all", "ทุกเคส", () => true],
  ["low", "คะแนนต่ำ", (r) => r.final_score != null && r.final_score < 70],
  ["slow", "ตอบช้า", (r) => Number(r.response_seconds || 0) >= 300],
  [
    "unsure",
    "AI ไม่มั่นใจ",
    (r) => r.sop_confidence != null && Number(r.sop_confidence) < 60,
  ],
  ["fatal", "Fatal Error", (r) => r.is_fatal === true],
  [
    "minor",
    "Minor Error",
    (r) => Array.isArray(r.minor_issues) && r.minor_issues.length > 0,
  ],
  ["dispute", "มี Dispute", (r) => Number(r.dispute_count || 0) > 0],
  ["manual", "Manual Case", (r) => r.source === "manual"],
  ["scraper", "Scraper Case", (r) => r.source === "scraper" || !r.source],
];

export default function ChatReview() {
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState(toISO(new Date(Date.now() - 7 * 864e5)));
  const [to, setTo] = useState(toISO(new Date()));
  const [sort, setSort] = useState("score");
  const [order, setOrder] = useState("asc");
  const [cust, setCust] = useState("");
  const [chatUser, setChatUser] = useState(null);
  const [evidence, setEvidence] = useState(null); // เคสที่เปิดดูหลักฐาน
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  const [err, setErr] = useState("");
  const load = () => {
    setLoading(true);
    setErr("");
    const p = new URLSearchParams({ from, to, sort, order, limit: "80" });
    if (cust) p.set("customer", cust);
    fetch("/api/replies?" + p)
      .then((r) => r.json())
      .then((d) => setRows(d.items || d.rows || d.replies || []))
      .catch((e) => {
        setErr("โหลดข้อมูลไม่สำเร็จ: " + e.message);
        setRows([]);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, [sort, order]);

  const fn = FILTERS.find((f) => f[0] === filter)?.[2] || (() => true);
  const shown = useMemo(() => rows.filter(fn), [rows, filter]);

  return (
    <AppShell
      title="Chat Review"
      subtitle="ตรวจสอบบทสนทนาที่ถูกนำมาประเมิน QC"
      actions={<ScoringCriteriaButton />}
    >
      <>
        <div
          className="glass"
          style={{ marginBottom: 12, fontSize: 13, color: "#bcd2f4" }}
        >
          หน้านี้ใช้ตรวจสอบบทสนทนาที่ถูกนำมาประเมิน QC เช่น เคสตอบช้า
          เคสคะแนนต่ำ เคส AI ไม่มั่นใจ เคส Fatal/Minor Error
          และเคสที่มีการโต้แย้งคะแนน — คลิก "ดูแชท" เพื่อดูบทสนทนา หรือ
          "ดูหลักฐาน" เพื่อตรวจหลักฐานอ้างอิง
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          {FILTERS.map(([key, label]) => (
            <span
              key={key}
              className={`chip ${filter === key ? "on" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
              {key !== "all" && (
                <span className="muted">
                  {" "}
                  ({rows.filter(FILTERS.find((f) => f[0] === key)[2]).length})
                </span>
              )}
            </span>
          ))}
        </div>
        <div
          className="card"
          style={{
            marginBottom: 12,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{ width: 150, margin: 0 }}
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ width: 150, margin: 0 }}
          />
          <input
            placeholder="ค้นชื่อลูกค้า"
            value={cust}
            onChange={(e) => setCust(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            style={{ margin: 0, flex: 1, minWidth: 150 }}
          />
          <select
            value={`${sort}:${order}`}
            onChange={(e) => {
              const [s, o] = e.target.value.split(":");
              setSort(s);
              setOrder(o);
            }}
            style={{ margin: 0, width: 200 }}
          >
            <option value="score:asc">คะแนนน้อย→มาก</option>
            <option value="score:desc">คะแนนมาก→น้อย</option>
            <option value="date:desc">ล่าสุด</option>
          </select>
          <button onClick={load}>{loading ? "..." : "ค้นหา"}</button>
        </div>

        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ลูกค้า</th>
                <th>แอดมิน</th>
                <th>คำตอบ</th>
                <th title="คะแนน QC เต็ม 100">คะแนน QC</th>
                <th>ประเภท</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan="7"
                    className="muted"
                    style={{ textAlign: "center", padding: 24 }}
                  >
                    <span className="spin" style={{ marginRight: 8 }}>
                      ⏳
                    </span>
                    กำลังโหลดข้อมูล...
                  </td>
                </tr>
              )}
              {!loading &&
                shown.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                      {new Date(r.created_at).toLocaleString("th-TH", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>{r.customer_name || r.line_user_id?.slice(0, 10)}</td>
                    <td>{r.admin_name || "—"}</td>
                    <td
                      style={{ maxWidth: 300, fontSize: 12, color: "#9fb3d6" }}
                    >
                      {String(r.reply_text || "").slice(0, 70)}
                    </td>
                    <td>
                      {r.final_score != null ? (
                        <span className={`score ${sc(r.final_score)}`}>
                          {r.final_score}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.source === "manual" && (
                        <span
                          className="badge"
                          style={{ background: "#0b5cab" }}
                        >
                          Manual
                        </span>
                      )}
                      {r.is_fatal && (
                        <span className="score bad" style={{ fontSize: 10 }}>
                          Fatal
                        </span>
                      )}
                      {!r.is_fatal &&
                        Array.isArray(r.minor_issues) &&
                        r.minor_issues.length > 0 && (
                          <span className="score warn" style={{ fontSize: 10 }}>
                            Minor
                          </span>
                        )}
                      {Number(r.dispute_count || 0) > 0 && (
                        <span
                          className="badge"
                          style={{ background: "#b45309" }}
                        >
                          Dispute
                        </span>
                      )}
                      {Number(r.response_seconds || 0) >= 300 && (
                        <span className="score warn" style={{ fontSize: 10 }}>
                          ตอบช้า
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        onClick={() =>
                          setChatUser({ line_user_id: r.line_user_id })
                        }
                        style={{ padding: "3px 10px", fontSize: 11 }}
                      >
                        ดูแชท
                      </button>{" "}
                      <button
                        onClick={() =>
                          setEvidence({
                            qcScoreId: r.qc_score_id,
                            conversationId: r.conversation_id,
                            caseRef: r.qc_score_id || r.id,
                          })
                        }
                        className="ghost"
                        style={{ padding: "3px 10px", fontSize: 11 }}
                      >
                        ดูหลักฐาน
                      </button>
                    </td>
                  </tr>
                ))}
              {!loading && err && (
                <tr>
                  <td
                    colSpan="7"
                    style={{
                      textAlign: "center",
                      padding: 20,
                      color: "#dc2626",
                    }}
                  >
                    ⚠️ {err}
                  </td>
                </tr>
              )}
              {!loading && !err && !shown.length && (
                <tr>
                  <td
                    colSpan="7"
                    className="muted"
                    style={{ textAlign: "center", padding: 20 }}
                  >
                    ไม่พบเคสในตัวกรองนี้ — ลองเปลี่ยนตัวกรองหรือขยายช่วงวันที่
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {chatUser && (
          <ChatModal user={chatUser} onClose={() => setChatUser(null)} />
        )}
        {evidence && (
          <EvidenceViewer
            qcScoreId={evidence.qcScoreId}
            conversationId={evidence.conversationId}
            caseRef={evidence.caseRef}
            onClose={() => setEvidence(null)}
          />
        )}
      </>
    </AppShell>
  );
}

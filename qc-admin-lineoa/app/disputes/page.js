"use client";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";

const sc = (v) => (v >= 85 ? "good" : v >= 70 ? "warn" : "bad");
const A = (v) => {
  try {
    return Array.isArray(v) ? v : JSON.parse(v) || [];
  } catch {
    return [];
  }
};

export default function Disputes() {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [pick, setPick] = useState(null);
  const [note, setNote] = useState("");
  const [newScore, setNewScore] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => {
    const p = filter ? `?status=${filter}` : "";
    fetch("/api/qc-disputes" + p)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.disputes || []);
        setCounts(d.counts || []);
        if (!d.disputes?.find((x) => x.id === pick)) setPick(d.disputes?.[0]?.id || null);
      });
  };
  useEffect(() => {
    load();
  }, [filter]);

  const review = async (id, status) => {
    const body = { status, reviewer_note: note };
    if (status === "approved" && newScore !== "") body.new_score = parseInt(newScore);
    const r = await fetch(`/api/qc-disputes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    setMsg(j.ok ? `✓ ${status}` : "⚠️ " + (j.error || "error"));
    setNote("");
    setNewScore("");
    load();
    setTimeout(() => setMsg(""), 2000);
  };
  const cmap = Object.fromEntries(counts.map((c) => [c.status, c.n]));
  const d = rows.find((x) => x.id === pick);

  return (
    <AppShell title="Dispute Review" subtitle="โต้แย้งผล AI — Manager ตรวจสอบ">
      <>
        <section className="grid kpis" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 14 }}>
          <div className="card">
            <div className="kpi-title">Pending</div>
            <div className="kpi-value score warn">{cmap.pending || 0}</div>
          </div>
          <div className="card">
            <div className="kpi-title">Approved</div>
            <div className="kpi-value score good">{cmap.approved || 0}</div>
          </div>
          <div className="card">
            <div className="kpi-title">Rejected</div>
            <div className="kpi-value score bad">{cmap.rejected || 0}</div>
          </div>
        </section>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {["pending", "approved", "rejected", ""].map((s) => (
            <button
              key={s || "all"}
              onClick={() => setFilter(s)}
              style={filter === s ? {} : { background: "#fff", color: "#65758b", border: "1px solid #dce6f2" }}
            >
              {s || "ทั้งหมด"}
            </button>
          ))}
        </div>
        {msg && (
          <div className="card" style={{ marginBottom: 12, color: msg[0] === "⚠" ? "#ef4444" : "#16a34a" }}>
            {msg}
          </div>
        )}

        <section className="grid" style={{ gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
          {/* queue */}
          <div className="card" style={{ padding: 8, maxHeight: "70vh", overflow: "auto" }}>
            {rows.map((x) => (
              <div
                key={x.id}
                onClick={() => setPick(x.id)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  cursor: "pointer",
                  marginBottom: 6,
                  background: pick === x.id ? "#eff6ff" : "#fff",
                  border: "1px solid " + (pick === x.id ? "#bfdbfe" : "#eef3f8"),
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <b style={{ fontSize: 13 }}>{x.admin_name || "—"}</b>
                  <span className={`score ${sc(x.old_score)}`}>{x.old_score}</span>
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {x.intent} · {new Date(x.created_at).toLocaleDateString("th-TH")}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#555",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {x.reason}
                </div>
              </div>
            ))}
            {!rows.length && (
              <div className="muted" style={{ padding: 16, textAlign: "center" }}>
                ไม่มี dispute
              </div>
            )}
          </div>

          {/* detail */}
          <div className="card">
            {!d ? (
              <div className="muted">เลือก dispute จากด้านซ้าย</div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>{d.admin_name}</h3>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {d.intent} · {new Date(d.created_at).toLocaleString("th-TH")}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className={`score ${sc(d.old_score)}`} style={{ fontSize: 22 }}>
                      {d.old_score}
                    </span>
                    {d.new_score != null && (
                      <>
                        <span className="muted">→</span>
                        <span className={`score ${sc(d.new_score)}`} style={{ fontSize: 22 }}>
                          {d.new_score}
                        </span>
                      </>
                    )}
                    <span
                      className="badge"
                      style={{
                        background:
                          d.status === "pending" ? "#fef9c3" : d.status === "approved" ? "#dcfce7" : "#fee2e2",
                        color: d.status === "pending" ? "#a16207" : d.status === "approved" ? "#16a34a" : "#dc2626",
                      }}
                    >
                      {d.status}
                    </span>
                  </div>
                </div>

                <div style={qa}>
                  <b>❓ คำถามลูกค้า</b>
                  <div>{d.customer_question || "—"}</div>
                </div>
                <div style={qa}>
                  <b>💬 คำตอบแอดมิน</b>
                  <div>{d.admin_answer || "—"}</div>
                </div>
                {d.matched_sop_topic && (
                  <div style={qa}>
                    <b>📋 Matched SOP:</b> {d.matched_sop_topic}
                    {d.expected_sop_answer && (
                      <div style={{ color: "#16a34a", fontSize: 12, marginTop: 3 }}>
                        ควรตอบ: {String(d.expected_sop_answer).slice(0, 180)}…
                      </div>
                    )}
                  </div>
                )}
                <div style={qa}>
                  <b>🤖 AI ให้เหตุผล</b>
                  <div style={{ color: "#dc2626", fontSize: 12 }}>{A(d.ai_reason).slice(0, 5).join(" · ") || "—"}</div>
                  {(() => {
                    const ev =
                      (typeof d.ai_evidence === "object"
                        ? d.ai_evidence
                        : (() => {
                            try {
                              return JSON.parse(d.ai_evidence);
                            } catch {
                              return {};
                            }
                          })()) || {};
                    return ev.missing_required_keywords?.length || ev.forbidden_keyword_hit?.length ? (
                      <div style={{ fontSize: 11, marginTop: 4 }}>
                        {ev.missing_required_keywords?.length > 0 && (
                          <div style={{ color: "#b45309" }}>ขาดคำสำคัญ: {ev.missing_required_keywords.join(", ")}</div>
                        )}
                        {ev.forbidden_keyword_hit?.length > 0 && (
                          <div style={{ color: "#dc2626" }}>คำต้องห้าม: {ev.forbidden_keyword_hit.join(", ")}</div>
                        )}
                      </div>
                    ) : null;
                  })()}
                  {(d.score_details || []).filter((x) => x.pass === false).length > 0 && (
                    <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                      มิติที่ตก:{" "}
                      {(d.score_details || [])
                        .filter((x) => x.pass === false)
                        .map((x) => `${x.category_code}(${x.raw_score ?? "-"})`)
                        .join(", ")}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    background: "#fff7ed",
                    borderLeft: "3px solid #f59e0b",
                    borderRadius: "0 8px 8px 0",
                    padding: 10,
                    margin: "8px 0",
                    fontSize: 13,
                  }}
                >
                  <b>⚖️ แอดมินโต้แย้ง:</b> {d.reason}
                </div>
                {d.reviewer_note && (
                  <div style={{ fontSize: 12, color: "#555" }}>
                    📝 Manager: {d.reviewer_note}{" "}
                    {d.reviewed_by && (
                      <span className="muted">
                        ({d.reviewed_by} · {d.reviewed_at ? new Date(d.reviewed_at).toLocaleString("th-TH") : ""})
                      </span>
                    )}
                  </div>
                )}

                {d.status === "pending" && (
                  <div style={{ marginTop: 12, borderTop: "1px solid #eef3f8", paddingTop: 12 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <input
                        placeholder="คะแนนใหม่ (0-100)"
                        type="number"
                        min="0"
                        max="100"
                        value={newScore}
                        onChange={(e) => setNewScore(e.target.value)}
                        style={{ width: 160, margin: 0 }}
                      />
                      <input
                        placeholder="หมายเหตุ Manager"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        style={{ flex: 1, margin: 0, minWidth: 180 }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button onClick={() => review(d.id, "approved")} style={{ background: "#16a34a" }}>
                        ✓ อนุมัติ + แก้คะแนน
                      </button>
                      <button onClick={() => review(d.id, "rejected")} style={{ background: "#ef4444" }}>
                        ✗ ปฏิเสธ
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </>
    </AppShell>
  );
}
const qa = { background: "#f8fafc", borderRadius: 8, padding: "8px 10px", marginTop: 8, fontSize: 13 };

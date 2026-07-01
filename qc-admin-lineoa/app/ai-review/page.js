"use client";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";

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
                <th>ลูกค้า</th>
                <th>แอดมิน</th>
                <th>เหตุผล</th>
                <th>Intent</th>
                <th>SOP conf.</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7" className="empty">
                    <span className="spin">⏳</span> โหลด...
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((r) => (
                  <tr key={r.id}>
                    <td>{r.customer_name || "—"}</td>
                    <td>{r.admin_name || "—"}</td>
                    <td
                      className="muted"
                      style={{ fontSize: 12, maxWidth: 220 }}
                    >
                      {r.reason}
                    </td>
                    <td>
                      <span className="badge">{r.detected_intent || "—"}</span>
                    </td>
                    <td
                      className={r.sop_confidence < 60 ? "score bad" : "muted"}
                    >
                      {r.sop_confidence != null ? r.sop_confidence + "%" : "—"}
                    </td>
                    <td>
                      <span
                        className={`score ${r.status === "pending" ? "warn" : r.status === "not_relevant" ? "bad" : "good"}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => setSel(r)}
                        style={{ padding: "3px 8px", fontSize: 11 }}
                      >
                        ตรวจ
                      </button>
                    </td>
                  </tr>
                ))}
              {!loading && !items.length && (
                <tr>
                  <td colSpan="7" className="empty">
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
            <div className="case" style={{ fontSize: 13 }}>
              <div>
                ลูกค้า:{" "}
                <b style={{ color: "#eaf2ff" }}>{sel.customer_text || "—"}</b>
              </div>
              <div>
                แอดมิน:{" "}
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

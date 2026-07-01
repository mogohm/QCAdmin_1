"use client";
import { useState } from "react";
import AppShell from "../components/AppShell";

// Manual Case — เพิ่มเคสด้วยตนเอง แล้วให้ QC engine ให้คะแนน
export default function ManualCase() {
  const [f, setF] = useState({
    customer_name: "",
    line_user_id: "",
    admin_name: "",
    customer_text: "",
    admin_text: "",
    customer_created_at: "",
    admin_created_at: "",
    response_seconds: "",
    intent: "",
    evidence_note: "",
    screenshot_path: "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    if (!f.customer_text || !f.admin_text)
      return alert("กรอกข้อความลูกค้าและแอดมิน");
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      const body = { ...f };
      if (body.response_seconds === "") delete body.response_seconds;
      const r = await fetch("/api/manual-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || "error");
      } else {
        setResult(j);
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      title="Manual Case"
      subtitle="เพิ่มเคสด้วยตนเอง — ระบบ QC จะให้คะแนนอัตโนมัติ"
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
        <span className="muted">หน้าหลัก / Manual Case</span>
      </div>
      <div
        className="glass"
        style={{ marginBottom: 12, fontSize: 13, color: "#bcd2f4" }}
      >
        กรอกบทสนทนาจริงที่ต้องการประเมิน ระบบจะรัน QC engine เดียวกับเคส scraper
        แล้วให้คะแนน + สร้างหลักฐาน เคสจะปรากฏใน Chat Review / QC Monitoring /
        Dashboard พร้อมป้าย <span className="badge">Manual Case</span>
      </div>
      {err && (
        <div
          className="glass glow empty"
          style={{ color: "#f6c65b", marginBottom: 12 }}
        >
          🔒{" "}
          {err === "forbidden"
            ? "ไม่มีสิทธิ์ (qc.score.override / qc.monitor.view)"
            : err}
        </div>
      )}
      {result && (
        <div className="glass glow" style={{ marginBottom: 12 }}>
          ✅ บันทึกเคสแล้ว — คะแนน QC:{" "}
          <b className="kpi-value" style={{ fontSize: 22 }}>
            {result.final_score}
          </b>{" "}
          <span className="muted">(qc_score_id: {result.qc_score_id})</span>
        </div>
      )}
      <div className="glass" style={{ maxWidth: 720 }}>
        <div
          className="grid"
          style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div>
            <label className="muted" style={{ fontSize: 12 }}>
              ชื่อลูกค้า
            </label>
            <input value={f.customer_name} onChange={set("customer_name")} />
          </div>
          <div>
            <label className="muted" style={{ fontSize: 12 }}>
              line_user_id (ถ้ามี)
            </label>
            <input
              value={f.line_user_id}
              onChange={set("line_user_id")}
              placeholder="เว้นว่างได้"
            />
          </div>
          <div>
            <label className="muted" style={{ fontSize: 12 }}>
              ชื่อแอดมิน *
            </label>
            <input
              value={f.admin_name}
              onChange={set("admin_name")}
              placeholder="เช่น PK KONG"
            />
          </div>
          <div>
            <label className="muted" style={{ fontSize: 12 }}>
              intent (ถ้าทราบ)
            </label>
            <input
              value={f.intent}
              onChange={set("intent")}
              placeholder="deposit/withdraw/poker..."
            />
          </div>
        </div>
        <label className="muted" style={{ fontSize: 12 }}>
          ข้อความลูกค้า *
        </label>
        <textarea
          value={f.customer_text}
          onChange={set("customer_text")}
          rows={2}
          style={{ width: "100%" }}
        />
        <label className="muted" style={{ fontSize: 12 }}>
          ข้อความแอดมิน (คำตอบ) *
        </label>
        <textarea
          value={f.admin_text}
          onChange={set("admin_text")}
          rows={2}
          style={{ width: "100%" }}
        />
        <div
          className="grid"
          style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}
        >
          <div>
            <label className="muted" style={{ fontSize: 12 }}>
              เวลาลูกค้าถาม
            </label>
            <input
              type="datetime-local"
              value={f.customer_created_at}
              onChange={set("customer_created_at")}
            />
          </div>
          <div>
            <label className="muted" style={{ fontSize: 12 }}>
              เวลาแอดมินตอบ
            </label>
            <input
              type="datetime-local"
              value={f.admin_created_at}
              onChange={set("admin_created_at")}
            />
          </div>
          <div>
            <label className="muted" style={{ fontSize: 12 }}>
              เวลาตอบ (วินาที)
            </label>
            <input
              value={f.response_seconds}
              onChange={set("response_seconds")}
              placeholder="auto ถ้าเว้นว่าง"
            />
          </div>
        </div>
        <label className="muted" style={{ fontSize: 12 }}>
          หลักฐาน/หมายเหตุ
        </label>
        <input value={f.evidence_note} onChange={set("evidence_note")} />
        <label className="muted" style={{ fontSize: 12 }}>
          path ภาพหน้าจอ (ถ้ามี)
        </label>
        <input
          value={f.screenshot_path}
          onChange={set("screenshot_path")}
          placeholder="/uploads/xxx.png"
        />
        <label className="muted" style={{ fontSize: 12 }}>
          เหตุผลที่เพิ่มเคสนี้
        </label>
        <input value={f.reason} onChange={set("reason")} />
        <button
          onClick={submit}
          disabled={busy}
          style={{ marginTop: 14, background: "#16a34a" }}
        >
          {busy ? "กำลังประเมิน..." : "➕ เพิ่มเคส + ให้คะแนน QC"}
        </button>
      </div>
    </AppShell>
  );
}

"use client";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";

const CATEGORIES = [
  "Poker",
  "App / Technical Issue",
  "Game Rules",
  "Promotion",
  "Tournament",
  "Jackpot",
  "KYC",
  "Deposit",
  "Withdraw",
];
const blank = {
  topic: "",
  answer: "",
  knowledge_type: "Poker",
  intent: "",
  required_keywords: "",
  forbidden_keywords: "",
  example_questions: "",
};

// AI Knowledge Training — สอน AI ความรู้ใหม่ (Poker/App/Game) → เก็บใน sop_scripts
export default function KnowledgeTraining() {
  const [items, setItems] = useState([]);
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState(null);
  const [test, setTest] = useState({ question: "", result: null });

  const load = () => {
    setLoading(true);
    setErr("");
    const qs = new URLSearchParams();
    if (type) qs.set("type", type);
    if (q) qs.set("q", q);
    fetch(`/api/knowledge-training?${qs.toString()}`)
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
  }, [type]);

  const save = async () => {
    if (!edit.topic || !edit.answer) return alert("กรอกหัวข้อและคำตอบ");
    const isNew = !edit.id;
    const url = isNew
      ? "/api/knowledge-training"
      : `/api/knowledge-training/${edit.id}`;
    // แปลง example_questions (คั่น |) และ required_keywords (คั่น ,) เป็น array
    const payload = {
      ...edit,
      example_questions: String(edit.example_questions || "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean),
      required_keywords: String(edit.required_keywords || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const r = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "error");
    setEdit(null);
    load();
  };
  const runTest = async () => {
    const r = await fetch("/api/knowledge-training/test-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: test.question }),
    });
    const j = await r.json();
    setTest({ ...test, result: j });
  };

  const actions = (
    <>
      <input
        placeholder="ค้นหา"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && load()}
        style={{ width: 160, margin: 0 }}
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        style={{ width: 150, margin: 0 }}
      >
        <option value="">ทุกหมวด</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button
        onClick={() => setEdit({ ...blank })}
        style={{ background: "#16a34a" }}
      >
        ➕ เพิ่มความรู้
      </button>
    </>
  );

  return (
    <AppShell
      title="AI Knowledge Training"
      subtitle="สอน AI ความรู้เกี่ยวกับ Poker / App / เกม"
      actions={actions}
    >
      <div
        className="glass"
        style={{ marginBottom: 12, fontSize: 13, color: "#bcd2f4" }}
      >
        เพิ่ม/แก้ความรู้ให้ AI เข้าใจคำถามเกี่ยวกับ Poker, แอปเกม, กติกา,
        โปรโมชัน ฯลฯ ระบบจะใช้ความรู้นี้ในการจับคู่ SOP และประเมิน QC —
        สามารถทดสอบการจับคู่ได้ทันที และสร้างความรู้จากเคสใน AI Review Queue
      </div>

      <div className="glass glow" style={{ marginBottom: 12 }}>
        <div className="panel-title" style={{ marginTop: 0 }}>
          🧪 ทดสอบการจับคู่ (ลองพิมพ์คำถามลูกค้า)
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={test.question}
            onChange={(e) => setTest({ ...test, question: e.target.value })}
            placeholder="เช่น C$ คืออะไร"
            style={{ flex: 1, margin: 0 }}
          />
          <button onClick={runTest}>ทดสอบ</button>
        </div>
        {test.result && (
          <div style={{ marginTop: 8, fontSize: 13 }}>
            {test.result.matched ? (
              <span className="score good">
                พบ SOP: {test.result.sop?.topic}{" "}
                {test.result.confidence != null
                  ? `(${test.result.confidence}%)`
                  : ""}
              </span>
            ) : (
              <span className="score bad">
                ยังไม่มีความรู้ที่ตรง — ควรเพิ่มความรู้ใหม่
              </span>
            )}
          </div>
        )}
      </div>

      {err ? (
        <div className="glass glow empty" style={{ color: "#f6c65b" }}>
          🔒{" "}
          {err === "forbidden" ? "ไม่มีสิทธิ์ (sop.create / sop.update)" : err}
        </div>
      ) : (
        <div className="glass">
          <table className="table">
            <thead>
              <tr>
                <th>หมวด</th>
                <th>หัวข้อ</th>
                <th>คำตอบ</th>
                <th>ตัวอย่างคำถาม</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="6" className="empty">
                    <span className="spin">⏳</span> โหลด...
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((k) => (
                  <tr key={k.id}>
                    <td>
                      <span className="badge">
                        {k.knowledge_type || k.category_code || k.intent || "—"}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, color: "#e7eefc" }}>
                      {k.topic}
                    </td>
                    <td
                      className="muted"
                      style={{ fontSize: 12, maxWidth: 240 }}
                    >
                      {(k.answer || "").slice(0, 80)}
                    </td>
                    <td className="muted" style={{ fontSize: 11 }}>
                      {Array.isArray(k.example_questions)
                        ? k.example_questions.length
                        : 0}{" "}
                      ข้อ
                    </td>
                    <td>
                      <span className={`score ${k.is_active ? "good" : "bad"}`}>
                        {k.training_status || (k.is_active ? "active" : "off")}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() =>
                          setEdit({
                            ...k,
                            required_keywords: (k.required_keywords || []).join(
                              ", ",
                            ),
                            example_questions: (k.example_questions || []).join(
                              " | ",
                            ),
                          })
                        }
                        style={{ padding: "3px 8px", fontSize: 11 }}
                      >
                        แก้
                      </button>
                    </td>
                  </tr>
                ))}
              {!loading && !items.length && (
                <tr>
                  <td colSpan="6" className="empty">
                    ยังไม่มีความรู้ในหมวดนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <div
          onClick={() => setEdit(null)}
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
              width: 560,
              maxWidth: "96vw",
              maxHeight: "90vh",
              overflow: "auto",
            }}
          >
            <h3 style={{ marginTop: 0 }}>
              {edit.id ? "แก้ความรู้" : "เพิ่มความรู้ใหม่"}
            </h3>
            <label className="muted" style={{ fontSize: 12 }}>
              หมวด
            </label>
            <select
              value={edit.knowledge_type || ""}
              onChange={(e) =>
                setEdit({ ...edit, knowledge_type: e.target.value })
              }
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="muted" style={{ fontSize: 12 }}>
              หัวข้อ *
            </label>
            <input
              value={edit.topic || ""}
              onChange={(e) => setEdit({ ...edit, topic: e.target.value })}
            />
            <label className="muted" style={{ fontSize: 12 }}>
              intent
            </label>
            <input
              value={edit.intent || ""}
              onChange={(e) => setEdit({ ...edit, intent: e.target.value })}
            />
            <label className="muted" style={{ fontSize: 12 }}>
              คำตอบที่ถูกต้อง *
            </label>
            <textarea
              value={edit.answer || ""}
              onChange={(e) => setEdit({ ...edit, answer: e.target.value })}
              rows={3}
              style={{ width: "100%" }}
            />
            <label className="muted" style={{ fontSize: 12 }}>
              required keywords (คั่นด้วย ,)
            </label>
            <input
              value={edit.required_keywords || ""}
              onChange={(e) =>
                setEdit({ ...edit, required_keywords: e.target.value })
              }
            />
            <label className="muted" style={{ fontSize: 12 }}>
              ตัวอย่างคำถามลูกค้า (คั่นด้วย |)
            </label>
            <input
              value={edit.example_questions || ""}
              onChange={(e) =>
                setEdit({ ...edit, example_questions: e.target.value })
              }
              placeholder="C$ คืออะไร | เติมเงินยังไง"
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={save} style={{ flex: 1, background: "#0b5cab" }}>
                💾 บันทึก + สอน AI
              </button>
              <button onClick={() => setEdit(null)} className="ghost">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

"use client";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import ChatModal from "../components/ChatModal";

const toISO = (d) => d.toISOString().slice(0, 10);
const sc = (v) => (v >= 85 ? "good" : v >= 70 ? "warn" : "bad");

export default function ChatReview() {
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState(toISO(new Date(Date.now() - 7 * 864e5)));
  const [to, setTo] = useState(toISO(new Date()));
  const [sort, setSort] = useState("score");
  const [order, setOrder] = useState("asc");
  const [cust, setCust] = useState("");
  const [chatUser, setChatUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const [err, setErr] = useState("");
  const load = () => {
    setLoading(true);
    setErr("");
    const p = new URLSearchParams({ from, to, sort, order, limit: "40" });
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

  return (
    <AppShell
      title="Chat Review"
      subtitle="ตรวจรีวิวคำตอบแอดมิน — คลิกเพื่อดูแชท + QC evidence"
    >
      <>
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
                <th>Admin</th>
                <th>คำตอบ</th>
                <th>คะแนน</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan="6"
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
                rows.map((r) => (
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
                    <td style={{ maxWidth: 320, fontSize: 12, color: "#555" }}>
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
                    <td>
                      <button
                        onClick={() =>
                          setChatUser({ line_user_id: r.line_user_id })
                        }
                        style={{ padding: "3px 10px", fontSize: 11 }}
                      >
                        ดูแชท
                      </button>
                    </td>
                  </tr>
                ))}
              {!loading && err && (
                <tr>
                  <td
                    colSpan="6"
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
              {!loading && !err && !rows.length && (
                <tr>
                  <td
                    colSpan="6"
                    className="muted"
                    style={{ textAlign: "center", padding: 20 }}
                  >
                    ไม่พบข้อมูลในช่วงวันที่นี้ — ลองขยายช่วงวันที่
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {chatUser && (
          <ChatModal user={chatUser} onClose={() => setChatUser(null)} />
        )}
      </>
    </AppShell>
  );
}

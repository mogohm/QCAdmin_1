"use client";
import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { roleLabel } from "@/lib/ui-labels";

export default function RegistrationRequests() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("pending");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    setErr("");
    fetch(`/api/system/registration-requests?status=${status}`)
      .then((r) =>
        r.ok
          ? r.json()
          : r.json().then((j) => Promise.reject(j.error || r.status)),
      )
      .then((d) => setRows(d.requests || []))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, [status]);

  const act = async (r, action) => {
    if (
      !confirm(`${action === "approve" ? "อนุมัติ" : "ปฏิเสธ"} ${r.username}?`)
    )
      return;
    const res = await fetch(`/api/system/registration-requests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = await res.json();
    if (!res.ok) return alert(j.error || "error");
    load();
  };

  const actions = (
    <select
      value={status}
      onChange={(e) => setStatus(e.target.value)}
      style={{ width: 160, margin: 0 }}
    >
      <option value="pending">รออนุมัติ</option>
      <option value="approved">อนุมัติแล้ว</option>
      <option value="rejected">ปฏิเสธ</option>
      <option value="all">ทั้งหมด</option>
    </select>
  );

  return (
    <AppShell
      title="คำขอลงทะเบียน"
      subtitle="คำขอสมัครเข้าใช้งาน"
      actions={actions}
    >
      {err ? (
        <div className="glass glow empty" style={{ color: "#f6c65b" }}>
          🔒 {err === "forbidden" ? "ไม่มีสิทธิ์ (system.users.create)" : err}
        </div>
      ) : (
        <div className="glass">
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>ชื่อ</th>
                <th>Email</th>
                <th>Role ที่ขอ</th>
                <th>Linked Admin</th>
                <th>หมายเหตุ</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8" className="empty">
                    <span className="spin">⏳</span> โหลด...
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700, color: "#e7eefc" }}>
                      {r.username}
                    </td>
                    <td>{r.display_name || "—"}</td>
                    <td className="muted">{r.email || "—"}</td>
                    <td>
                      <span className="badge">
                        {roleLabel(r.requested_role)}
                      </span>
                    </td>
                    <td className="muted">{r.linked_admin_name || "—"}</td>
                    <td
                      className="muted"
                      style={{ fontSize: 12, maxWidth: 160 }}
                    >
                      {r.note || "—"}
                    </td>
                    <td>
                      <span
                        className={`score ${r.status === "approved" ? "good" : r.status === "pending" ? "warn" : "bad"}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.status === "pending" && (
                        <>
                          <button
                            onClick={() => act(r, "approve")}
                            style={{
                              padding: "3px 8px",
                              fontSize: 11,
                              background: "#16a34a",
                            }}
                          >
                            อนุมัติ
                          </button>{" "}
                          <button
                            onClick={() => act(r, "reject")}
                            style={{
                              padding: "3px 8px",
                              fontSize: 11,
                              background: "#ef4444",
                            }}
                          >
                            ปฏิเสธ
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              {!loading && !rows.length && (
                <tr>
                  <td colSpan="8" className="empty">
                    ไม่มีคำขอ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

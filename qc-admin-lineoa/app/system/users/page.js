"use client";
import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { roleLabel } from "@/lib/ui-labels";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState(null); // user being edited (or {} for new)
  const [admins, setAdmins] = useState([]);

  const load = () => {
    setLoading(true);
    setErr("");
    fetch(`/api/system/users?q=${encodeURIComponent(q)}`)
      .then((r) =>
        r.ok
          ? r.json()
          : r.json().then((j) => Promise.reject(j.error || r.status)),
      )
      .then((d) => {
        setUsers(d.users || []);
        setRoles(d.roles || []);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    fetch("/api/admin/list")
      .then((r) => (r.ok ? r.json() : []))
      .then((a) => setAdmins(Array.isArray(a) ? a : []))
      .catch(() => {});
  }, []);

  const save = async () => {
    const isNew = !edit.id;
    const url = isNew ? "/api/system/users" : `/api/system/users/${edit.id}`;
    const r = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edit),
    });
    const j = await r.json();
    if (!r.ok) {
      alert(j.error || "error");
      return;
    }
    if (j.temp_password) alert("รหัสชั่วคราว: " + j.temp_password);
    setEdit(null);
    load();
  };
  const act = async (u, action) => {
    if (action === "reset" && !confirm("รีเซ็ตรหัสผ่าน " + u.username + "?"))
      return;
    const r = await fetch(`/api/system/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "error");
    if (j.temp_password) alert("รหัสชั่วคราว: " + j.temp_password);
    load();
  };
  // เปลี่ยนรหัสผ่าน: กำหนดรหัสใหม่เองให้ผู้ใช้
  const setPassword = async (u) => {
    const pw = prompt(
      `ตั้งรหัสผ่านใหม่ให้ ${u.username} (อย่างน้อย 6 ตัวอักษร):`,
    );
    if (pw === null) return;
    if (pw.length < 6) return alert("รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร");
    const r = await fetch(`/api/system/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: pw }),
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "error");
    alert(`เปลี่ยนรหัสผ่าน ${u.username} เรียบร้อย`);
    load();
  };

  const actions = (
    <>
      <input
        placeholder="ค้นหา user/ชื่อ/email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && load()}
        style={{ width: 220, margin: 0 }}
      />
      <button onClick={load}>{loading ? "..." : "ค้นหา"}</button>
      <button
        onClick={() => setEdit({ role: "admin", status: "active" })}
        style={{ background: "#16a34a" }}
      >
        ➕ สร้างผู้ใช้
      </button>
    </>
  );

  return (
    <AppShell
      title="User & Role Management"
      subtitle="จัดการบัญชีผู้ใช้ · บทบาท · สถานะ"
      actions={actions}
    >
      {err ? (
        <div className="glass glow empty" style={{ color: "#f6c65b" }}>
          🔒{" "}
          {err === "forbidden"
            ? "ไม่มีสิทธิ์เข้าดูข้อมูลนี้ (system.users.view)"
            : err}
        </div>
      ) : (
        <div className="glass">
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>ชื่อ</th>
                <th>Role</th>
                <th>สถานะ</th>
                <th>Linked Admin</th>
                <th>Last Login</th>
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
                users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 700, color: "#e7eefc" }}>
                      {u.username}
                    </td>
                    <td>{u.display_name || "—"}</td>
                    <td>
                      <span className="badge">{roleLabel(u.role)}</span>
                    </td>
                    <td>
                      <span
                        className={`score ${u.status === "active" ? "good" : u.status === "pending" ? "warn" : "bad"}`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="muted">{u.linked_admin || "—"}</td>
                    <td className="muted" style={{ fontSize: 11 }}>
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleString("th-TH")
                        : "—"}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => setEdit(u)}
                        style={{ padding: "3px 8px", fontSize: 11 }}
                      >
                        แก้
                      </button>{" "}
                      <button
                        onClick={() => setPassword(u)}
                        style={{
                          padding: "3px 8px",
                          fontSize: 11,
                          background: "#0b5cab",
                        }}
                      >
                        เปลี่ยนรหัส
                      </button>{" "}
                      <button
                        onClick={() => act(u, "reset")}
                        className="ghost"
                        style={{ padding: "3px 8px", fontSize: 11 }}
                      >
                        รีเซ็ต
                      </button>{" "}
                      {u.status === "active" ? (
                        <button
                          onClick={() => act(u, "disable")}
                          style={{
                            padding: "3px 8px",
                            fontSize: 11,
                            background: "#ef4444",
                          }}
                        >
                          ปิด
                        </button>
                      ) : (
                        <button
                          onClick={() => act(u, "enable")}
                          style={{
                            padding: "3px 8px",
                            fontSize: 11,
                            background: "#16a34a",
                          }}
                        >
                          เปิด
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              {!loading && !users.length && (
                <tr>
                  <td colSpan="7" className="empty">
                    ไม่พบผู้ใช้
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
            background: "rgba(2,8,25,.7)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="glass glow"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 380, maxWidth: "92vw" }}
          >
            <h3 style={{ marginTop: 0 }}>
              {edit.id ? "แก้ไขผู้ใช้: " + edit.username : "สร้างผู้ใช้ใหม่"}
            </h3>
            {!edit.id && (
              <>
                <label style={{ fontSize: 12 }} className="muted">
                  Username
                </label>
                <input
                  value={edit.username || ""}
                  onChange={(e) =>
                    setEdit({ ...edit, username: e.target.value })
                  }
                />
                <label style={{ fontSize: 12 }} className="muted">
                  Password
                </label>
                <input
                  type="password"
                  value={edit.password || ""}
                  onChange={(e) =>
                    setEdit({ ...edit, password: e.target.value })
                  }
                />
              </>
            )}
            <label style={{ fontSize: 12 }} className="muted">
              ชื่อที่แสดง
            </label>
            <input
              value={edit.display_name || ""}
              onChange={(e) =>
                setEdit({ ...edit, display_name: e.target.value })
              }
            />
            <label style={{ fontSize: 12 }} className="muted">
              Email
            </label>
            <input
              value={edit.email || ""}
              onChange={(e) => setEdit({ ...edit, email: e.target.value })}
            />
            <label style={{ fontSize: 12 }} className="muted">
              Role
            </label>
            <select
              value={edit.role || "admin"}
              onChange={(e) => setEdit({ ...edit, role: e.target.value })}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            <label style={{ fontSize: 12 }} className="muted">
              ผูกกับ QC Admin
            </label>
            <select
              value={edit.linked_admin_id || ""}
              onChange={(e) =>
                setEdit({ ...edit, linked_admin_id: e.target.value || null })
              }
            >
              <option value="">— ไม่ผูก —</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.member_name}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={save} style={{ flex: 1 }}>
                บันทึก
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

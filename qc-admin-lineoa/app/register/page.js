"use client";
import { useState } from "react";

const inp = {
  width: "100%",
  margin: "6px 0 12px",
  padding: 11,
  borderRadius: 10,
  border: "1px solid #27456f",
  background: "#0e1c33",
  color: "#eaf2ff",
  outline: "none",
};

export default function Register() {
  const [f, setF] = useState({
    username: "",
    password: "",
    confirm_password: "",
    display_name: "",
    email: "",
    requested_role: "admin",
    linked_admin_name: "",
    note: "",
  });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setMsg("");
    if (f.password !== f.confirm_password) {
      setErr("รหัสผ่านไม่ตรงกัน");
      setBusy(false);
      return;
    }
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error || "สมัครไม่สำเร็จ");
      else setMsg(j.message || "ส่งคำขอแล้ว รอผู้ดูแลระบบอนุมัติ");
    } catch {
      setErr("เชื่อมต่อไม่ได้");
    }
    setBusy(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(1200px 600px at 50% -10%,#1b3a6b,#0a1424 60%)",
        fontFamily: "Inter,'Noto Sans Thai',sans-serif",
        padding: 20,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: 400,
          background: "rgba(17,28,48,.92)",
          border: "1px solid #21406e",
          borderRadius: 18,
          padding: 30,
          boxShadow: "0 20px 60px rgba(0,0,0,.5)",
          color: "#dbe7fb",
        }}
      >
        <div style={{ textAlign: "center", fontSize: 13, letterSpacing: 1, color: "#5fd0ff" }}>AI QC PROGRAM</div>
        <h2 style={{ textAlign: "center", margin: "4px 0 4px" }}>สมัครขอเข้าใช้งาน</h2>
        <p style={{ textAlign: "center", color: "#7d92b5", fontSize: 12, marginTop: 0 }}>
          คำขอจะถูกส่งให้ผู้ดูแลระบบอนุมัติก่อนเข้าใช้งาน
        </p>
        {msg && <div style={{ color: "#22c55e", fontSize: 13, margin: "8px 0" }}>✅ {msg}</div>}
        {err && <div style={{ color: "#ff8585", fontSize: 13, margin: "8px 0" }}>⚠️ {err}</div>}
        <label style={{ fontSize: 12 }}>Username</label>
        <input value={f.username} onChange={set("username")} style={inp} required />
        <label style={{ fontSize: 12 }}>Password</label>
        <input type="password" value={f.password} onChange={set("password")} style={inp} required />
        <label style={{ fontSize: 12 }}>ยืนยัน Password</label>
        <input type="password" value={f.confirm_password} onChange={set("confirm_password")} style={inp} required />
        <label style={{ fontSize: 12 }}>ชื่อที่แสดง</label>
        <input value={f.display_name} onChange={set("display_name")} style={inp} />
        <label style={{ fontSize: 12 }}>Email</label>
        <input type="email" value={f.email} onChange={set("email")} style={inp} />
        <label style={{ fontSize: 12 }}>บทบาทที่ขอ</label>
        <select value={f.requested_role} onChange={set("requested_role")} style={inp}>
          <option value="admin">Admin (QC Operator)</option>
          <option value="leader">Leader</option>
          <option value="manager">Manager</option>
          <option value="marketing">Marketing</option>
        </select>
        <label style={{ fontSize: 12 }}>ผูกกับชื่อแอดมิน (ถ้ามี)</label>
        <input
          value={f.linked_admin_name}
          onChange={set("linked_admin_name")}
          placeholder="เช่น PK - Mei"
          style={inp}
        />
        <label style={{ fontSize: 12 }}>เหตุผล / หมายเหตุ</label>
        <input value={f.note} onChange={set("note")} style={inp} />
        <button disabled={busy} style={{ width: "100%", marginTop: 8, padding: 12 }}>
          {busy ? "..." : "ส่งคำขอสมัคร"}
        </button>
        <div style={{ textAlign: "center", marginTop: 14, fontSize: 12 }}>
          <a href="/login" style={{ color: "#5fd0ff" }}>
            มีบัญชีแล้ว? เข้าสู่ระบบ
          </a>
        </div>
      </form>
    </div>
  );
}

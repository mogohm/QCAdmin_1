"use client";
import { useEffect, useState } from "react";

export default function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  // แสดงข้อความเมื่อถูกส่งมาจาก session หมดอายุ (?expired=1)
  useEffect(() => {
    if (new URLSearchParams(location.search).get("expired"))
      setErr("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p, remember }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || "login ไม่สำเร็จ");
        setBusy(false);
        return;
      }
      // redirect ตาม role (home จาก /api/auth/me) หรือ ?next=
      const next = new URLSearchParams(location.search).get("next");
      let home = "/";
      try {
        home = (await (await fetch("/api/auth/me")).json()).home || "/";
      } catch {}
      window.location.href = next || home;
    } catch {
      setErr("เชื่อมต่อไม่ได้");
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(1200px 600px at 50% -10%,#1b3a6b,#0a1424 60%)",
        fontFamily: "Inter,'Noto Sans Thai',sans-serif",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: 360,
          background: "rgba(17,28,48,.92)",
          border: "1px solid #21406e",
          borderRadius: 18,
          padding: 30,
          boxShadow: "0 20px 60px rgba(0,0,0,.5)",
          color: "#dbe7fb",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: 6,
            fontSize: 13,
            letterSpacing: 1,
            color: "#5fd0ff",
          }}
        >
          AI QC PROGRAM
        </div>
        <h2 style={{ textAlign: "center", margin: "0 0 4px" }}>เข้าสู่ระบบ</h2>
        <p
          style={{
            textAlign: "center",
            color: "#7d92b5",
            fontSize: 12,
            marginTop: 0,
          }}
        >
          ระบบแดชบอร์ด AI ควบคุมคุณภาพ
        </p>
        <label style={{ fontSize: 12, color: "#9fb3d6" }}>Username</label>
        <input
          value={u}
          onChange={(e) => setU(e.target.value)}
          autoFocus
          placeholder="manager / marketing / ชื่อ admin"
          style={inp}
        />
        <label style={{ fontSize: 12, color: "#9fb3d6" }}>Password</label>
        <input
          type="password"
          value={p}
          onChange={(e) => setP(e.target.value)}
          style={inp}
        />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "#bcd2f4",
            margin: "2px 0 6px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          จดจำการเข้าสู่ระบบ (30 วัน)
        </label>
        {err && (
          <div style={{ color: "#ff8585", fontSize: 13, margin: "6px 0" }}>
            ⚠️ {err}
          </div>
        )}
        <button
          disabled={busy}
          style={{
            width: "100%",
            marginTop: 10,
            padding: 12,
            border: 0,
            borderRadius: 12,
            fontWeight: 800,
            color: "#fff",
            cursor: "pointer",
            background: "linear-gradient(135deg,#0b5cab,#09a8d8)",
          }}
        >
          {busy ? "..." : "เข้าสู่ระบบ"}
        </button>
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <a href="/register" style={{ color: "#5fd0ff", fontSize: 13 }}>
            ยังไม่มีบัญชี? สมัครขอเข้าใช้งาน
          </a>
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "#6b80a6",
            lineHeight: 1.6,
          }}
        >
          <b>บัญชีเริ่มต้น:</b>
          <br />
          ผู้ดูแลระบบ: <code>sysadmin / sysadmin123</code>
          <br />
          ผู้จัดการ: <code>manager / manager123</code> · หัวหน้า:{" "}
          <code>leader / leader123</code>
          <br />
          การตลาด: <code>marketing / marketing123</code> · แอดมิน:{" "}
          <code>slug / pk1234</code>
        </div>
      </form>
    </div>
  );
}
const inp = {
  width: "100%",
  margin: "6px 0 14px",
  padding: 11,
  borderRadius: 10,
  border: "1px solid #27456f",
  background: "#0e1c33",
  color: "#eaf2ff",
  outline: "none",
};

"use client";
import { useEffect, useState } from "react";
import { MENU, filterMenuByPermissions } from "@/lib/menu";

// Sidebar แบบ permission-based จริง: ดึง /api/auth/me แล้วกรองเมนูด้วย filterMenuByPermissions()
//   ห้ามแสดงเมนูที่ user ไม่มีสิทธิ์ (system_admin เห็นทั้งหมด)
export default function Sidebar({ active }) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => {});
  }, []);
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  // กรองตามสิทธิ์: ยังไม่ได้ /api/auth/me → เมนูว่าง (กันเมนูแฟลชให้คนไม่มีสิทธิ์)
  const visibleMenu = me?.authenticated ? filterMenuByPermissions(me, MENU) : [];

  return (
    <aside className="side">
      <div className="brand">
        QC<span>Admin</span>
      </div>
      <div className="brand-sub">AI QC PROGRAM</div>
      <nav className="nav">
        {visibleMenu.map((item) => (
          <a key={item.href} href={item.href} className={active === item.href ? "active" : ""}>
            <span style={{ marginRight: 8 }}>{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
      <div style={{ marginTop: "auto", paddingTop: 16, fontSize: 12, color: "#9fb3d6" }}>
        {me?.authenticated ? (
          <>
            <div style={{ marginBottom: 6 }}>
              👤 {me.name}{" "}
              <span style={{ background: "rgba(255,255,255,.12)", borderRadius: 6, padding: "1px 7px", fontSize: 10 }}>
                {me.role}
              </span>
            </div>
            <button onClick={logout} style={{ background: "rgba(255,255,255,.12)", fontSize: 12, padding: "6px 12px" }}>
              ออกจากระบบ
            </button>
          </>
        ) : (
          <a
            href="/login"
            style={{
              display: "inline-block",
              background: "rgba(255,255,255,.12)",
              borderRadius: 10,
              padding: "8px 14px",
              color: "#fff",
              textDecoration: "none",
            }}
          >
            เข้าสู่ระบบ
          </a>
        )}
      </div>
    </aside>
  );
}

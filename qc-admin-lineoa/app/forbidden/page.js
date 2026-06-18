"use client";
import AppShell from "../components/AppShell";

export default function Forbidden() {
  return (
    <AppShell title="403 — ไม่มีสิทธิ์เข้าถึง" subtitle="Access denied">
      <div className="glass glow" style={{ textAlign: "center", padding: 48 }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h2 style={{ color: "#f6c65b" }}>ไม่มีสิทธิ์เข้าดูข้อมูลนี้</h2>
        <p className="muted">บทบาทของคุณไม่ได้รับอนุญาตให้เข้าหน้านี้ — ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่ม</p>
        <a href="/" className="btn" style={{ marginTop: 12, display: "inline-block" }}>
          กลับหน้าหลัก
        </a>
      </div>
    </AppShell>
  );
}

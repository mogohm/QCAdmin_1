"use client";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";
import LeaderboardTable from "../components/LeaderboardTable";

const toISO = (d) => d.toISOString().slice(0, 10);
const sc = (v) => (v >= 85 ? "good" : v >= 70 ? "warn" : "bad");

export default function Leaderboard() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(toISO(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(toISO(new Date()));
  const load = () => {
    setLoading(true);
    fetch(`/api/dashboard?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);
  const ranking = (d?.ranking || []).filter((a) => a.cases > 0);
  const actions = (
    <>
      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        style={{ width: 140, margin: 0 }}
      />
      <input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        style={{ width: 140, margin: 0 }}
      />
      <button onClick={load}>{loading ? "..." : "ดู"}</button>
    </>
  );
  return (
    <AppShell
      title="🏆 จัดอันดับแอดมิน"
      subtitle="อันดับผลงานแอดมิน"
      actions={actions}
    >
      {loading && (
        <div className="loadbar">
          <span className="spin">⏳</span> กำลังโหลด...
        </div>
      )}
      <div
        className="glass"
        style={{ marginBottom: 12, fontSize: 13, color: "#bcd2f4" }}
      >
        หน้านี้ใช้ดูอันดับผลงานของแอดมินจากคะแนน QC เฉลี่ย จำนวนเคสที่ดูแล
        ความเร็วในการตอบ และจำนวนเคสผิดพลาด
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div
          className="muted"
          style={{ fontSize: 12, width: "100%", marginBottom: -4 }}
        >
          🏅 แอดมินผลงานดีที่สุด
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        {ranking.slice(0, 3).map((a, i) => (
          <div
            key={a.id}
            className="glass glow"
            style={{ flex: 1, padding: 16, textAlign: "center" }}
          >
            <span
              className={`medal ${["g", "s", "b"][i]}`}
              style={{
                margin: "0 auto 8px",
                width: 38,
                height: 38,
                fontSize: 18,
              }}
            >
              {i + 1}
            </span>
            <div style={{ fontWeight: 800, color: "#eef4ff" }}>
              {a.member_name}
            </div>
            <div
              className={`score ${sc(a.avg_score)}`}
              style={{ fontSize: 26 }}
            >
              {a.avg_score}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {a.cases} เคส
            </div>
          </div>
        ))}
      </div>
      <section className="grid split">
        <GlassPanel
          title="อันดับทั้งหมด"
          glow
          empty={!ranking.length && !loading && "ยังไม่มีข้อมูล"}
        >
          <LeaderboardTable rows={ranking} />
        </GlassPanel>
        <GlassPanel
          title="📈 พัฒนาดีขึ้นมากที่สุด"
          tag="7 วัน เทียบก่อนหน้า"
          glow
          empty={
            !(d?.mostImproved || []).length &&
            !loading &&
            "ยังไม่มีข้อมูลเปรียบเทียบ"
          }
        >
          {(d?.mostImproved || []).map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 4px",
                borderBottom: "1px solid rgba(125,211,252,.08)",
              }}
            >
              <span style={{ color: "#dbe7ff" }}>{m.admin}</span>
              <span
                style={{
                  color: m.delta >= 0 ? "var(--green)" : "var(--red)",
                  fontWeight: 800,
                }}
              >
                {m.delta >= 0 ? "▲" : "▼"} {Math.abs(m.delta)} ({m.previous}→
                {m.current})
              </span>
            </div>
          ))}
        </GlassPanel>
      </section>
    </AppShell>
  );
}

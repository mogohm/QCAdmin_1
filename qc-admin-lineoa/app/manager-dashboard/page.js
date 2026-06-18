"use client";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";
import MetricTile from "../components/MetricTile";
import MiniLineChart from "../components/MiniLineChart";
import BarChart from "../components/BarChart";
import LeaderboardTable from "../components/LeaderboardTable";

const toISO = (d) => d.toISOString().slice(0, 10);
const fmtSec = (s) => (s == null || s <= 0 ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`);

export default function ManagerDashboard() {
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
  const k = d?.kpiExt || {};
  const ranking = (d?.ranking || []).filter((a) => a.cases > 0);
  const actions = (
    <>
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140, margin: 0 }} />
      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140, margin: 0 }} />
      <button onClick={load}>{loading ? "..." : "ดู"}</button>
    </>
  );
  return (
    <AppShell title="📊 Manager Dashboard" subtitle="ภาพรวมทีม QC" actions={actions}>
      {loading && (
        <div className="loadbar">
          <span className="spin">⏳</span> กำลังโหลด...
        </div>
      )}
      <div className="grid kpis" style={{ gridTemplateColumns: "repeat(5,1fr)", marginBottom: 14 }}>
        <MetricTile
          label="Avg QA"
          value={k.avgQaScore ?? 0}
          tone={k.avgQaScore >= 85 ? "green" : k.avgQaScore >= 70 ? "gold" : "red"}
        />
        <MetricTile label="QA Coverage" value={(k.qaCoveragePercent ?? 0) + "%"} tone="blue" />
        <MetricTile label="SLA Pass" value={(k.slaPassPercent ?? 0) + "%"} tone="green" />
        <MetricTile label="Fatal" value={k.fatalCount ?? 0} tone="red" />
        <MetricTile label="Pending Disputes" value={k.pendingDisputes ?? 0} tone="gold" />
      </div>
      <section className="grid split">
        <GlassPanel title="Team Average & Trend" glow>
          <MiniLineChart
            data={[...(d?.weeklySummary || [])].reverse().map((w) => ({ label: w.day, value: w.avg_score }))}
            height={160}
          />
        </GlassPanel>
        <GlassPanel title="Bottleneck Analysis" tag="มิติที่ตกบ่อย" glow>
          <BarChart
            rows={[...(d?.categorySummary || [])]
              .filter((c) => !["minorError", "fatalError"].includes(c.category_code))
              .sort((a, b) => (b.fail_count || 0) - (a.fail_count || 0))
              .slice(0, 6)
              .map((c) => ({
                label: c.category_code,
                value: c.fail_count || 0,
                color: "linear-gradient(90deg,#ef4444,#f6c65b)",
              }))}
            unit=" fail"
          />
        </GlassPanel>
      </section>
      <GlassPanel title="Team Members" tag={`${ranking.length} คน`} glow style={{ marginTop: 16 }}>
        <LeaderboardTable rows={ranking} />
      </GlassPanel>
    </AppShell>
  );
}

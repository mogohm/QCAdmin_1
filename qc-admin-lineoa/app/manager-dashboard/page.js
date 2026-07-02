"use client";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import { ScoringCriteriaButton } from "../components/ScoringCriteriaPanel";
import MetricHelp from "../components/MetricHelp";
import GlassPanel from "../components/GlassPanel";
import MetricTile from "../components/MetricTile";
import MiniLineChart from "../components/MiniLineChart";
import BarChart from "../components/BarChart";
import LeaderboardTable from "../components/LeaderboardTable";
import { categoryLabel, PENALTY_CODES } from "@/lib/ui-labels";

const toISO = (d) => d.toISOString().slice(0, 10);

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
      <ScoringCriteriaButton />
    </>
  );
  return (
    <AppShell
      title="📊 แดชบอร์ดผู้จัดการ"
      subtitle="ภาพรวมคุณภาพทีม QC"
      actions={actions}
    >
      {loading && (
        <div className="loadbar">
          <span className="spin">⏳</span> กำลังโหลด...
        </div>
      )}
      <div
        className="grid kpis"
        style={{ gridTemplateColumns: "repeat(5,1fr)", marginBottom: 14 }}
      >
        <MetricTile
          label="คะแนน QC เฉลี่ย"
          value={k.avgQaScore ?? 0}
          tone={
            k.avgQaScore >= 85 ? "green" : k.avgQaScore >= 70 ? "gold" : "red"
          }
        />
        <MetricTile
          label="สัดส่วนเคสที่ตรวจแล้ว"
          value={(k.qaCoveragePercent ?? 0) + "%"}
          tone="blue"
        />
        <MetricTile
          label="ตอบทันตาม SLA"
          value={(k.slaPassPercent ?? 0) + "%"}
          tone="green"
        />
        <MetricTile
          label="ข้อผิดพลาดร้ายแรง"
          value={k.fatalCount ?? 0}
          tone="red"
        />
        <MetricTile
          label="รอพิจารณาการโต้แย้ง"
          value={k.pendingDisputes ?? 0}
          tone="gold"
        />
      </div>
      <section className="grid split">
        <GlassPanel title="แนวโน้มคะแนนทีม" glow>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            คะแนน QC เฉลี่ยของทีมในแต่ละวัน
            <MetricHelp label="แนวโน้มคะแนนทีม" />
          </div>
          <MiniLineChart
            data={[...(d?.weeklySummary || [])]
              .reverse()
              .map((w) => ({ label: w.day, value: w.avg_score }))}
            height={160}
          />
        </GlassPanel>
        <GlassPanel title="จุดที่ทีมทำพลาดบ่อย" tag="หมวดที่ตกบ่อย" glow>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            หมวดที่มีเคสผิดพลาดมากสุด — ควรปรับปรุงก่อน
            <MetricHelp label="จุดที่ทีมทำพลาดบ่อย" />
          </div>
          <BarChart
            rows={[...(d?.categorySummary || [])]
              .filter((c) => !PENALTY_CODES.includes(c.category_code))
              .sort((a, b) => (b.fail_count || 0) - (a.fail_count || 0))
              .slice(0, 6)
              .map((c) => ({
                label: categoryLabel(c.category_code),
                value: c.fail_count || 0,
                color: "linear-gradient(90deg,#ef4444,#f6c65b)",
              }))}
            unit=" เคส"
          />
        </GlassPanel>
      </section>
      <GlassPanel
        title="สมาชิกทีม"
        tag={`${ranking.length} คน`}
        glow
        style={{ marginTop: 16 }}
      >
        <LeaderboardTable rows={ranking} />
      </GlassPanel>
    </AppShell>
  );
}

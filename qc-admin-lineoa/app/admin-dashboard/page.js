"use client";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";
import KpiGauge from "../components/KpiGauge";
import RadarChart from "../components/RadarChart";
import MetricTile from "../components/MetricTile";
import AdminAvatarCard from "../components/AdminAvatarCard";

const toISO = (d) => d.toISOString().slice(0, 10);
const fmtSec = (s) => (s == null || s <= 0 ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`);
const baht = (n) => "฿" + Number(n || 0).toLocaleString();

export default function AdminDashboard() {
  const [d, setD] = useState(null);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const from = toISO(new Date(Date.now() - 29 * 864e5));
  const to = toISO(new Date());

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => {});
    fetch(`/api/dashboard?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const ranking = d?.ranking || [];
  const mine = me?.adminId ? ranking.find((a) => a.id === me.adminId) : null;
  const skill = me?.adminId ? (d?.adminCategoryRanking || []).find((a) => a.admin_id === me.adminId) : null;
  const comm = me?.adminId ? (d?.commissionSummary?.per_admin || []).find((a) => a.admin_id === me.adminId) : null;
  const radar = skill
    ? [
        { label: "Greet", value: skill.greeting_closing },
        { label: "Problem", value: skill.problem_solving },
        { label: "Tone", value: skill.communication_tone },
        { label: "Response", value: skill.response_time },
      ].filter((x) => x.value != null)
    : [];

  return (
    <AppShell title="🧑‍💼 Admin Dashboard" subtitle="ผลงานของฉัน · 30 วันล่าสุด">
      {loading ? (
        <div className="loadbar">
          <span className="spin">⏳</span> กำลังโหลด...
        </div>
      ) : !mine ? (
        <GlassPanel
          title="ผลงานของฉัน"
          glow
          empty="ยังไม่มีข้อมูลผลงานของบัญชีนี้ (ต้องผูกกับ QC Admin และมีเคสในช่วงนี้)"
        />
      ) : (
        <section className="grid split">
          <GlassPanel title="Performance Overview" glow>
            <AdminAvatarCard name={mine.member_name} score={mine.avg_score} cases={mine.cases} tier={comm?.tier} />
            <div className="grid" style={{ gridTemplateColumns: "1.1fr 1fr 1fr", marginTop: 14, gap: 10 }}>
              <div className="glass" style={{ padding: 10 }}>
                <KpiGauge value={mine.avg_score} label="Avg QA" size={120} />
              </div>
              <MetricTile label="เคส" value={mine.cases} tone="blue" />
              <MetricTile label="ตอบเฉลี่ย" value={fmtSec(mine.avg_response_sec)} tone="blue" />
            </div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <MetricTile label="ดี (≥85)" value={mine.good || 0} tone="green" />
              <MetricTile label="ต่ำ (<70)" value={mine.bad || 0} tone="red" />
            </div>
            <MetricTile label="Est. Commission" value={baht(comm?.estimated_commission)} hint={comm?.tier} />
          </GlassPanel>
          <GlassPanel title="Skill & Coaching" glow>
            <RadarChart axes={radar} size={220} />
            <div className="case" style={{ marginTop: 10, fontSize: 12 }}>
              <b className="muted">มิติที่อ่อนสุด (ทีม)</b>
              <div style={{ marginTop: 4 }}>
                {(d?.coachingSummary?.lowest_categories || []).slice(0, 3).map((c, i) => (
                  <span key={i} className="badge" style={{ marginRight: 4 }}>
                    {c.category_code} {c.avg_score}
                  </span>
                ))}
              </div>
            </div>
          </GlassPanel>
        </section>
      )}
    </AppShell>
  );
}

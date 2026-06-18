"use client";
import { useEffect, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import GlassPanel from "./components/GlassPanel";
import KpiGauge from "./components/KpiGauge";
import RadarChart from "./components/RadarChart";
import MiniLineChart from "./components/MiniLineChart";
import BarChart from "./components/BarChart";
import FunnelChart from "./components/FunnelChart";
import MetricTile from "./components/MetricTile";
import LeaderboardTable from "./components/LeaderboardTable";
import AdminAvatarCard from "./components/AdminAvatarCard";

const toISO = (d) => d.toISOString().slice(0, 10);
const sc = (v) => (v >= 85 ? "good" : v >= 70 ? "warn" : "bad");
const fmtSec = (s) => {
  s = Number(s || 0);
  return s <= 0 ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
};
const baht = (n) => "฿" + Number(n || 0).toLocaleString();

// เบลอ panel ที่ role ไม่มีสิทธิ์ดู (PART I) — การ enforce จริงอยู่ที่ API
function Gated({ need, perms, role, children }) {
  const allowed = role === "system_admin" || (perms || []).includes(need);
  if (allowed) return children;
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 18 }}>
      <div style={{ filter: "blur(8px)", pointerEvents: "none", userSelect: "none", opacity: 0.45 }}>{children}</div>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <div
          className="glass glow"
          style={{ padding: "14px 20px", color: "#f6c65b", textAlign: "center", fontWeight: 700 }}
        >
          🔒 ไม่มีสิทธิ์เข้าดูข้อมูลนี้
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [me, setMe] = useState(null);
  const [from, setFrom] = useState(toISO(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(toISO(new Date()));
  const [loading, setLoading] = useState(false);
  const [pickAdmin, setPickAdmin] = useState(null);

  const load = (f = from, t = to) => {
    setLoading(true);
    fetch(`/api/dashboard?from=${f}&to=${t}`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => {});
  }, []);
  const perms = me?.permissions || [];
  const role = me?.role;

  const quick = (key) => {
    const now = new Date();
    let f, t;
    if (key === "today") f = t = toISO(now);
    else if (key === "yesterday") f = t = toISO(new Date(Date.now() - 864e5));
    else if (key === "7d") {
      f = toISO(new Date(Date.now() - 6 * 864e5));
      t = toISO(now);
    } else if (key === "month") {
      f = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
      t = toISO(now);
    }
    setFrom(f);
    setTo(t);
    load(f, t);
  };

  const ranking = useMemo(() => (d?.ranking || []).filter((a) => a.cases > 0), [d]);
  const acr = d?.adminCategoryRanking || [];
  const skillById = useMemo(() => Object.fromEntries(acr.map((a) => [a.admin_id, a])), [acr]);
  const commById = useMemo(
    () => Object.fromEntries((d?.commissionSummary?.per_admin || []).map((a) => [a.admin_id, a])),
    [d],
  );
  const k = d?.kpiExt || {};

  // selected admin (default = อันดับ 1)
  const selId = pickAdmin || ranking[0]?.id || null;
  const selAdmin = ranking.find((a) => a.id === selId) || null;
  const selSkill = skillById[selId];
  const selComm = commById[selId];
  const radarAxes = selSkill
    ? [
        { label: "Greet", value: selSkill.greeting_closing },
        { label: "Problem", value: selSkill.problem_solving },
        { label: "Tone", value: selSkill.communication_tone },
        { label: "Response", value: selSkill.response_time },
      ].filter((x) => x.value != null)
    : [];

  const actions = (
    <>
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140, margin: 0 }} />
      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140, margin: 0 }} />
      <button onClick={() => load()}>{loading ? "..." : "🔄 ดู"}</button>
    </>
  );

  const QF = ({ id, label }) => (
    <span className="chip" onClick={() => quick(id)}>
      {label}
    </span>
  );

  return (
    <AppShell title="AI QC PROGRAM DASHBOARD SYSTEM" subtitle="ระบบแดชบอร์ด AI ควบคุมคุณภาพ" actions={actions}>
      <>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <QF id="today" label="วันนี้" />
          <QF id="yesterday" label="เมื่อวาน" />
          <QF id="7d" label="7 วันล่าสุด" />
          <QF id="month" label="เดือนนี้" />
          <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
            ช่วง {from} → {to}
          </span>
        </div>

        {loading && (
          <div className="loadbar">
            <span className="spin">⏳</span> กำลังโหลดข้อมูล Dashboard...
          </div>
        )}

        <section className="grid dash2x2">
          {/* ===== Panel 1: Admin Dashboard ===== */}
          <Gated need="dashboard.admin.view" perms={perms} role={role}>
            <GlassPanel
              title="🧑‍💼 Admin Dashboard"
              tag="รายบุคคล"
              glow
              empty={!ranking.length && !loading && "ยังไม่มีข้อมูลในช่วงวันที่นี้"}
            >
              <select value={selId || ""} onChange={(e) => setPickAdmin(e.target.value)} style={{ marginBottom: 12 }}>
                {ranking.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.member_name} — {a.avg_score}
                  </option>
                ))}
              </select>
              {selAdmin && (
                <>
                  <AdminAvatarCard
                    name={selAdmin.member_name}
                    score={selAdmin.avg_score}
                    cases={selAdmin.cases}
                    tier={selComm?.tier}
                  />
                  <div className="grid" style={{ gridTemplateColumns: "1.1fr 1fr 1fr", marginTop: 14, gap: 10 }}>
                    <div className="glass" style={{ padding: 10 }}>
                      <KpiGauge value={selAdmin.avg_score} label="Avg QA Score" size={120} />
                    </div>
                    <MetricTile label="Total Cases" value={selAdmin.cases} tone="blue" />
                    <MetricTile label="ตอบเฉลี่ย" value={fmtSec(selAdmin.avg_response_sec)} tone="blue" />
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 12, gap: 12 }}>
                    <div>
                      <div className="panel-title">Skill Radar</div>
                      <RadarChart axes={radarAxes} size={210} />
                    </div>
                    <div>
                      <div className="panel-title">AI Coaching</div>
                      <MetricTile label="Est. Commission" value={baht(selComm?.estimated_commission)} />
                      <div className="case" style={{ marginTop: 10, fontSize: 12 }}>
                        <b className="muted">มิติที่อ่อนสุด</b>
                        <div>
                          {(d?.coachingSummary?.lowest_categories || []).slice(0, 3).map((c, i) => (
                            <span
                              key={i}
                              className="badge"
                              style={{ marginRight: 4, marginTop: 4, display: "inline-block" }}
                            >
                              {c.category_code} {c.avg_score}
                            </span>
                          )) || "—"}
                        </div>
                        <b className="muted" style={{ display: "block", marginTop: 8 }}>
                          ปัญหาที่พบบ่อย
                        </b>
                        <div style={{ color: "#cfe0ff" }}>
                          {(d?.coachingSummary?.repeated_fail_reasons || [])
                            .slice(0, 2)
                            .map((r) => r.reason || r)
                            .join(" · ") || "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </GlassPanel>
          </Gated>

          {/* ===== Panel 2: Manager Dashboard ===== */}
          <Gated need="dashboard.manager.view" perms={perms} role={role}>
            <GlassPanel title="📊 Manager Dashboard" tag="ภาพรวมทีม" glow>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                <MetricTile
                  label="Avg QA"
                  value={k.avgQaScore ?? 0}
                  tone={k.avgQaScore >= 85 ? "green" : k.avgQaScore >= 70 ? "gold" : "red"}
                />
                <MetricTile label="QA Coverage" value={(k.qaCoveragePercent ?? 0) + "%"} tone="blue" />
                <MetricTile label="SLA Pass" value={(k.slaPassPercent ?? 0) + "%"} tone="green" />
                <MetricTile label="ตอบเฉลี่ย" value={fmtSec(k.avgResponseSec)} tone="blue" />
              </div>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                <MetricTile label="Fatal" value={k.fatalCount ?? 0} tone="red" />
                <MetricTile label="Minor" value={k.minorCount ?? 0} tone="gold" />
                <MetricTile label="Pending Disputes" value={k.pendingDisputes ?? 0} tone="gold" />
              </div>
              <div className="panel-title" style={{ marginTop: 16 }}>
                Team Average & Trend
              </div>
              <MiniLineChart
                data={[...(d?.weeklySummary || [])].reverse().map((w) => ({ label: w.day, value: w.avg_score }))}
                height={140}
              />
              <div className="panel-title" style={{ marginTop: 12 }}>
                Bottleneck Analysis <span className="tag">มิติที่ตกบ่อย</span>
              </div>
              <BarChart
                rows={[...(d?.categorySummary || [])]
                  .filter((c) => !["minorError", "fatalError"].includes(c.category_code))
                  .sort((a, b) => (b.fail_count || 0) - (a.fail_count || 0))
                  .slice(0, 5)
                  .map((c) => ({
                    label: c.category_code,
                    value: c.fail_count || 0,
                    color: "linear-gradient(90deg,#ef4444,#f6c65b)",
                  }))}
                unit=" fail"
              />
            </GlassPanel>
          </Gated>

          {/* ===== Panel 3: Leaderboard ===== */}
          <Gated need="dashboard.leaderboard.view" perms={perms} role={role}>
            <GlassPanel
              title="🏆 Leaderboard"
              tag="อันดับ"
              glow
              empty={!ranking.length && !loading && "ยังไม่มีข้อมูล"}
            >
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                {ranking.slice(0, 3).map((a, i) => (
                  <div key={a.id} className="glass" style={{ flex: 1, padding: 12, textAlign: "center" }}>
                    <span className={`medal ${["g", "s", "b"][i]}`} style={{ margin: "0 auto 6px" }}>
                      {i + 1}
                    </span>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "#eef4ff" }}>{a.member_name}</div>
                    <div className={`score ${sc(a.avg_score)}`} style={{ fontSize: 20 }}>
                      {a.avg_score}
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {a.cases} เคส
                    </div>
                  </div>
                ))}
              </div>
              <LeaderboardTable rows={ranking.slice(0, 10)} onPick={(a) => setPickAdmin(a.id)} />
              <div className="panel-title" style={{ marginTop: 14 }}>
                📈 Most Improved <span className="tag">7 วัน vs ก่อนหน้า</span>
              </div>
              {(d?.mostImproved || []).length ? (
                (d.mostImproved || []).slice(0, 5).map((m, i) => (
                  <div
                    key={i}
                    style={{ display: "flex", justifyContent: "space-between", padding: "6px 4px", fontSize: 13 }}
                  >
                    <span style={{ color: "#dbe7ff" }}>{m.admin}</span>
                    <span style={{ color: m.delta >= 0 ? "var(--green)" : "var(--red)", fontWeight: 800 }}>
                      {m.delta >= 0 ? "▲" : "▼"} {Math.abs(m.delta)} ({m.previous}→{m.current})
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty">ยังไม่มีข้อมูลเปรียบเทียบ</div>
              )}
            </GlassPanel>
          </Gated>

          {/* ===== Panel 4: Marketing Dashboard ===== */}
          <Gated need="dashboard.marketing.view" perms={perms} role={role}>
            <GlassPanel title="📣 Marketing Dashboard" tag="การตลาด" glow>
              {(() => {
                const m = d?.marketingSummary || {};
                const hasData = (m.registration || 0) + (m.deposit_count || 0) + (m.kyc_total || 0) > 0;
                if (!hasData && !loading) return <div className="empty">ยังไม่มีข้อมูลในช่วงวันที่นี้</div>;
                return (
                  <>
                    <div className="panel-title">Registration Funnel</div>
                    <FunnelChart
                      steps={[
                        { label: "สมัคร", value: m.registration || 0 },
                        { label: "สมัครสำเร็จ", value: m.registration_pass || 0 },
                        { label: "KYC ผ่าน", value: m.kyc_pass || 0 },
                        { label: "ล้มเหลว", value: m.registration_fail || 0, color: "#ef4444" },
                      ]}
                    />
                    <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                      <MetricTile
                        label="Deposit รวม"
                        value={baht(m.deposit_total)}
                        tone="green"
                        hint={`${m.deposit_count || 0} ครั้ง`}
                      />
                      <MetricTile
                        label="Withdraw รวม"
                        value={baht(m.withdraw_total)}
                        tone="red"
                        hint={`${m.withdraw_count || 0} ครั้ง`}
                      />
                    </div>
                    <div className="panel-title" style={{ marginTop: 14 }}>
                      KYC
                    </div>
                    <BarChart
                      rows={[
                        { label: "ผ่าน KYC", value: m.kyc_pass || 0, color: "linear-gradient(90deg,#22c55e,#38bdf8)" },
                        { label: "ทั้งหมด", value: m.kyc_total || 0 },
                      ]}
                    />
                    <div className="panel-title" style={{ marginTop: 14 }}>
                      Promotion
                    </div>
                    <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <MetricTile label="ผู้ร่วมโปร" value={m.promotion_participants || 0} tone="blue" />
                      <MetricTile label="ยอดฝากจากโปร" value={baht(m.promotion_deposit)} tone="gold" />
                    </div>
                  </>
                );
              })()}
            </GlassPanel>
          </Gated>
        </section>
      </>
    </AppShell>
  );
}

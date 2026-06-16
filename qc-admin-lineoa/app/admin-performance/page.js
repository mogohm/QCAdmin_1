"use client";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";

const toISO = (d) => d.toISOString().slice(0, 10);
const sc = (v) => (v >= 85 ? "good" : v >= 70 ? "warn" : "bad");
const fmtSec = (s) => {
  s = Number(s || 0);
  return s <= 0 ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
};
const heatBg = (v) =>
  v == null
    ? "#f1f5f9"
    : v >= 90
      ? "#16a34a"
      : v >= 80
        ? "#65a30d"
        : v >= 70
          ? "#f59e0b"
          : v >= 50
            ? "#f97316"
            : "#ef4444";
const CATS = [
  ["greeting_closing", "Greet/Close"],
  ["problem_solving", "Problem"],
  ["communication_tone", "Tone"],
  ["response_time", "Response"],
];

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export default function AdminPerformance() {
  const [d, setD] = useState(null);
  const [from, setFrom] = useState(toISO(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(toISO(new Date()));
  const [pick, setPick] = useState(null);

  const load = () =>
    fetch(`/api/dashboard?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then(setD);
  useEffect(() => {
    load();
  }, []);

  const ranking = (d?.ranking || []).filter((a) => a.cases > 0);
  const skillRows = d?.adminCategoryRanking || [];
  const skill = Object.fromEntries(skillRows.map((a) => [a.admin_id, a]));
  const sel = pick ? ranking.find((a) => a.id === pick) : null;
  const selSkill = pick ? skill[pick] : null;
  const coachNeeded = skillRows.filter((a) => CATS.some(([c]) => a[c] != null && a[c] < 70));

  const exportCSV = () => {
    const header = [
      "Admin",
      "Cases",
      "AvgScore",
      "AvgResponseSec",
      "Good",
      "Bad",
      "Greet",
      "Problem",
      "Tone",
      "Response",
      "Reg",
      "Deposit",
    ];
    const body = ranking.map((a) => {
      const s = skill[a.id] || {};
      return [
        a.member_name,
        a.cases,
        a.avg_score,
        a.avg_response_sec,
        a.good,
        a.bad,
        s.greeting_closing,
        s.problem_solving,
        s.communication_tone,
        s.response_time,
        a.reg_count,
        a.deposit_sum,
      ];
    });
    downloadCSV(`admin-performance_${from}_${to}.csv`, [header, ...body]);
  };

  const actions = (
    <>
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150, margin: 0 }} />
      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150, margin: 0 }} />
      <button onClick={load}>ดู</button>
      <button onClick={exportCSV} style={{ background: "#16a34a" }}>
        ⬇ CSV
      </button>
    </>
  );

  return (
    <AppShell title="Admin Performance" subtitle="คะแนนรายแอดมิน · heatmap · coaching" actions={actions}>
      <>
        {/* Heatmap */}
        <div className="card" style={{ marginBottom: 16, overflow: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Category Heatmap</h3>
          <table className="table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Admin</th>
                {CATS.map(([, l]) => (
                  <th key={l} style={{ textAlign: "center" }}>
                    {l}
                  </th>
                ))}
                <th style={{ textAlign: "center" }}>เฉลี่ย</th>
              </tr>
            </thead>
            <tbody>
              {skillRows.map((a) => {
                const vals = CATS.map(([c]) => a[c]).filter((v) => v != null);
                const avg = vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : null;
                return (
                  <tr key={a.admin_id}>
                    <td style={{ fontWeight: 600 }}>{a.admin}</td>
                    {CATS.map(([c]) => (
                      <td key={c} style={{ textAlign: "center", padding: 4 }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 38,
                            height: 26,
                            lineHeight: "26px",
                            borderRadius: 6,
                            color: "#fff",
                            fontWeight: 700,
                            background: heatBg(a[c]),
                          }}
                        >
                          {a[c] ?? "—"}
                        </span>
                      </td>
                    ))}
                    <td style={{ textAlign: "center", fontWeight: 800 }}>{avg ?? "—"}</td>
                  </tr>
                );
              })}
              {!skillRows.length && (
                <tr>
                  <td colSpan={CATS.length + 2} className="muted">
                    ยังไม่มีคะแนนรายมิติ (engine v4) — มีเมื่อข้อความใหม่เข้ามา
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <section className="grid split">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Ranking</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Admin</th>
                  <th>เคส</th>
                  <th>คะแนน</th>
                  <th>Resp</th>
                  <th>Bad</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((a, i) => (
                  <tr
                    key={a.id}
                    onClick={() => setPick(a.id)}
                    style={{ cursor: "pointer", background: pick === a.id ? "#eff6ff" : "" }}
                  >
                    <td>{i + 1}</td>
                    <td>{a.member_name}</td>
                    <td>{a.cases}</td>
                    <td className={`score ${sc(a.avg_score)}`}>{a.avg_score}</td>
                    <td>{fmtSec(a.avg_response_sec)}</td>
                    <td className="score bad">{a.bad || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>🎓 Coaching Needed</h3>
            {coachNeeded.map((a) => (
              <div key={a.admin_id} className="case" style={{ padding: 8 }}>
                <b>{a.admin}</b>
                <div>
                  {CATS.filter(([c]) => a[c] != null && a[c] < 70).map(([c, l]) => (
                    <span
                      key={c}
                      className="badge"
                      style={{ marginRight: 4, background: "#fef2f2", color: "#dc2626", fontSize: 10 }}
                    >
                      {l} {a[c]}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {!coachNeeded.length && <div className="muted">ทุกคนผ่านเกณฑ์ 👍</div>}
          </div>
        </section>

        {/* drilldown */}
        {sel && (
          <section className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>🔍 {sel.member_name}</h3>
            <section className="grid kpis" style={{ gridTemplateColumns: "repeat(6,1fr)" }}>
              <div className="card">
                <div className="kpi-title">คะแนนเฉลี่ย</div>
                <div className={`kpi-value score ${sc(sel.avg_score)}`}>{sel.avg_score}</div>
              </div>
              <div className="card">
                <div className="kpi-title">เคส</div>
                <div className="kpi-value">{sel.cases}</div>
              </div>
              <div className="card">
                <div className="kpi-title">ตอบเฉลี่ย</div>
                <div className="kpi-value">{fmtSec(sel.avg_response_sec)}</div>
              </div>
              <div className="card">
                <div className="kpi-title">ดี (≥85)</div>
                <div className="kpi-value score good">{sel.good || 0}</div>
              </div>
              <div className="card">
                <div className="kpi-title">ต่ำ (&lt;70)</div>
                <div className="kpi-value score bad">{sel.bad || 0}</div>
              </div>
              <div className="card">
                <div className="kpi-title">สมัคร/ฝาก</div>
                <div className="kpi-value" style={{ fontSize: 16 }}>
                  {sel.reg_count || 0}/฿{Number(sel.deposit_sum || 0).toLocaleString()}
                </div>
              </div>
            </section>
          </section>
        )}
        {!sel && (
          <div className="muted" style={{ marginTop: 12 }}>
            คลิกแถว admin ใน Ranking เพื่อดูรายละเอียด
          </div>
        )}
      </>
    </AppShell>
  );
}

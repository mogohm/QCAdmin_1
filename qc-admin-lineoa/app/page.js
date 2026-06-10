'use client';
import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatModal from './components/ChatModal';

const toISO = d => d.toISOString().slice(0, 10);
const weekAgo = () => toISO(new Date(Date.now() - 7 * 864e5));
const today = () => toISO(new Date());
const sc = v => (v >= 85 ? 'good' : v >= 70 ? 'warn' : 'bad');
const fmtSec = s => { s = Number(s || 0); return s <= 0 ? '—' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`; };
const A = v => { try { return Array.isArray(v) ? v : (JSON.parse(v) || []); } catch { return []; } };
const O = v => { try { return typeof v === 'object' ? v : (JSON.parse(v) || {}); } catch { return {}; } };

function Trend({ rows }) {
  const data = [...(rows || [])].reverse().filter(r => r.avg_score != null);
  if (data.length < 2) return <div className="muted" style={{ fontSize: 12 }}>ข้อมูลไม่พอวาดกราฟ</div>;
  const W = 560, H = 150, pad = 26;
  const xs = data.map((_, i) => pad + i * (W - 2 * pad) / (data.length - 1));
  const ys = data.map(d => H - pad - (d.avg_score / 100) * (H - 2 * pad));
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {[0, 50, 100].map(g => { const y = H - pad - g / 100 * (H - 2 * pad); return (<g key={g}><line x1={pad} y1={y} x2={W - pad} y2={y} stroke="#eef3f8" /><text x={4} y={y + 3} fontSize="9" fill="#aaa">{g}</text></g>); })}
      <path d={xs.map((x, i) => `${i ? 'L' : 'M'}${x},${ys[i]}`).join(' ')} fill="none" stroke="#0b5cab" strokeWidth="2.5" />
      {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="3" fill={data[i].avg_score >= 85 ? '#16a34a' : data[i].avg_score >= 70 ? '#f59e0b' : '#ef4444'} />)}
    </svg>
  );
}
function Bars({ rows }) {
  const mx = Math.max(1, ...rows.map(r => r.v));
  return rows.map(r => (
    <div key={r.label} style={{ margin: '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}><span>{r.label}</span><b>{r.v}</b></div>
      <div style={{ background: '#eef3f8', borderRadius: 6, height: 8 }}><div style={{ width: r.v / mx * 100 + '%', height: 8, borderRadius: 6, background: r.color || 'linear-gradient(90deg,#0b5cab,#09a8d8)' }} /></div>
    </div>
  ));
}

export default function Executive() {
  const [d, setD] = useState(null);
  const [from, setFrom] = useState(weekAgo());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(false);
  const [chatUser, setChatUser] = useState(null);

  const load = (f = from, t = to) => {
    setLoading(true);
    fetch(`/api/dashboard?from=${f}&to=${t}`).then(r => r.json()).then(setD).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const k = d?.kpiExt || {};
  const KPIS = [
    ['Avg QA Score', k.avgQaScore ?? 0, sc(k.avgQaScore)], ['QA Coverage', (k.qaCoveragePercent ?? 0) + '%'],
    ['SOP Coverage', (k.sopCoveragePercent ?? 0) + '%'], ['SLA Pass', (k.slaPassPercent ?? 0) + '%'],
    ['Fatal Errors', k.fatalCount ?? 0, 'bad'], ['Minor Errors', k.minorCount ?? 0, 'warn'],
    ['Pending Disputes', k.pendingDisputes ?? 0, 'warn'], ['Est. Commission', '฿' + (k.estimatedCommission ?? 0).toLocaleString()],
  ];

  return (
    <div className="shell">
      <Sidebar active="/" />
      <main className="main">
        <div className="top">
          <div><h2 style={{ margin: 0 }}>Executive Dashboard</h2><div className="muted" style={{ fontSize: 12 }}>ภาพรวมคุณภาพการบริการ QC</div></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 150, margin: 0 }} />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 150, margin: 0 }} />
            <button onClick={() => load()}>{loading ? '...' : 'ดู'}</button>
          </div>
        </div>

        {/* KPI cards */}
        <section className="grid kpis">
          {KPIS.map(([title, v, cls]) => <div className="card" key={title}><div className="kpi-title">{title}</div><div className={`kpi-value ${cls ? 'score ' + cls : ''}`}>{v}</div></div>)}
        </section>

        {/* Trend + Category */}
        <section className="grid split" style={{ marginTop: 16 }}>
          <div className="card"><h3 style={{ marginTop: 0 }}>QA Score Trend</h3><Trend rows={d?.weeklySummary} /></div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Category Breakdown</h3>
            <table className="table"><thead><tr><th>หมวด</th><th>เคส</th><th>คะแนน</th><th>Fatal</th></tr></thead>
              <tbody>{(d?.categorySummary || []).map(c => <tr key={c.intent}><td>{c.intent}</td><td>{c.n}</td><td className={`score ${sc(c.avg_score)}`}>{c.avg_score}</td><td className="score bad">{c.fatal || 0}</td></tr>)}</tbody></table>
          </div>
        </section>

        {/* Intent + SOP coverage */}
        <section className="grid split" style={{ marginTop: 16 }}>
          <div className="card"><h3 style={{ marginTop: 0 }}>Intent Distribution</h3>
            <Bars rows={(d?.intentDistribution || []).map(x => ({ label: x.intent, v: x.n }))} /></div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>SOP Coverage</h3>
            <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
              <div style={{ flex: 1, textAlign: 'center', padding: 12, background: '#ecfdf5', borderRadius: 10 }}><div style={{ fontSize: 26, fontWeight: 900, color: '#16a34a' }}>{d?.sopCoverage?.matched ?? 0}</div><div className="muted" style={{ fontSize: 11 }}>Matched</div></div>
              <div style={{ flex: 1, textAlign: 'center', padding: 12, background: '#fef2f2', borderRadius: 10 }}><div style={{ fontSize: 26, fontWeight: 900, color: '#ef4444' }}>{d?.sopCoverage?.unmatched ?? 0}</div><div className="muted" style={{ fontSize: 11 }}>Unmatched</div></div>
              <div style={{ flex: 1, textAlign: 'center', padding: 12, background: '#eff6ff', borderRadius: 10 }}><div style={{ fontSize: 26, fontWeight: 900, color: '#0b5cab' }}>{d?.sopCoverage?.percent ?? 0}%</div><div className="muted" style={{ fontSize: 11 }}>Coverage</div></div>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>Intent ที่ยังไม่มี SOP ตรง: {(d?.sopCoverage?.top_unmatched_intents || []).map(x => `${x.intent}(${x.n})`).join(', ') || '—'}</div>
          </div>
        </section>

        {/* Admin Ranking + Skill Matrix */}
        <section className="grid split" style={{ marginTop: 16 }}>
          <div className="card"><h3 style={{ marginTop: 0 }}>Admin Ranking</h3>
            <table className="table"><thead><tr><th>#</th><th>Admin</th><th>เคส</th><th>คะแนน</th><th>ตอบเฉลี่ย</th></tr></thead>
              <tbody>{(d?.ranking || []).filter(a => a.cases > 0).slice(0, 10).map((a, i) => <tr key={a.id}><td>{i + 1}</td><td>{a.member_name}</td><td>{a.cases}</td><td className={`score ${sc(a.avg_score)}`}>{a.avg_score}</td><td>{fmtSec(a.avg_response_sec)}</td></tr>)}</tbody></table>
          </div>
          <div className="card"><h3 style={{ marginTop: 0 }}>Admin Skill Matrix</h3>
            <table className="table"><thead><tr><th>Admin</th><th>Greet</th><th>Solve</th><th>Tone</th><th>Resp</th></tr></thead>
              <tbody>{(d?.adminCategoryRanking || []).slice(0, 10).map(a => <tr key={a.admin_id}><td>{a.admin}</td>
                {['greeting_closing', 'problem_solving', 'communication_tone', 'response_time'].map(c => <td key={c} className={`score ${a[c] != null ? sc(a[c]) : ''}`}>{a[c] ?? '—'}</td>)}</tr>)}
                {!d?.adminCategoryRanking?.length && <tr><td colSpan="5" className="muted">ยังไม่มีข้อมูลรายมิติ</td></tr>}</tbody></table>
          </div>
        </section>

        {/* Fatal + Coaching */}
        <section className="grid split" style={{ marginTop: 16 }}>
          <div className="card"><h3 style={{ marginTop: 0 }}>🔴 Fatal Case List</h3>
            <table className="table"><thead><tr><th>Admin</th><th>Intent</th><th>เหตุผล</th><th></th></tr></thead>
              <tbody>{(d?.fatalCases || []).slice(0, 10).map(c => <tr key={c.id}><td>{c.admin || '—'}</td><td>{c.intent}</td><td style={{ fontSize: 11, color: '#dc2626' }}>{A(c.fatal_reasons).map(x => x.name || x).join(', ') || '—'}</td><td>{c.line_user_id && <button onClick={() => setChatUser({ line_user_id: c.line_user_id })} style={{ padding: '3px 8px', fontSize: 11 }}>ดู</button>}</td></tr>)}
                {!d?.fatalCases?.length && <tr><td colSpan="4" className="muted">ไม่มี Fatal 🎉</td></tr>}</tbody></table>
          </div>
          <div className="card"><h3 style={{ marginTop: 0 }}>🎓 Coaching Recommendations</h3>
            <div style={{ fontSize: 12, marginBottom: 8 }}><b>หมวดที่อ่อนสุด:</b> {(d?.coachingSummary?.lowest_categories || []).map(c => `${c.intent}(${c.avg_score})`).join(', ') || '—'}</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}><b>ปัญหาที่พบซ้ำ:</b></div>
            {(d?.coachingSummary?.repeated_fail_reasons || []).slice(0, 6).map((r, i) => <div key={i} style={{ fontSize: 11, color: '#b45309', margin: '3px 0' }}>• {r.fail_reason} <span className="muted">×{r.n}</span></div>)}
            {!d?.coachingSummary?.repeated_fail_reasons?.length && <div className="muted" style={{ fontSize: 12 }}>—</div>}
          </div>
        </section>

        {/* Dispute preview + Pending replies */}
        <section className="grid split" style={{ marginTop: 16 }}>
          <div className="card"><h3 style={{ marginTop: 0 }}>⚖️ Dispute Queue <a href="/disputes" style={{ fontSize: 12, float: 'right' }}>จัดการ →</a></h3>
            <div style={{ display: 'flex', gap: 12 }}>
              {[['Pending', d?.disputeSummary?.pending, '#f59e0b'], ['Approved', d?.disputeSummary?.approved, '#16a34a'], ['Rejected', d?.disputeSummary?.rejected, '#ef4444']].map(([l, v, c]) =>
                <div key={l} style={{ flex: 1, textAlign: 'center', padding: 12, background: '#f8fafc', borderRadius: 10 }}><div style={{ fontSize: 24, fontWeight: 900, color: c }}>{v ?? 0}</div><div className="muted" style={{ fontSize: 11 }}>{l}</div></div>)}
            </div>
          </div>
          <div className="card"><h3 style={{ marginTop: 0 }}>⏳ Pending Reply List</h3>
            <table className="table"><thead><tr><th>ลูกค้า</th><th>รอ (นาที)</th><th>Admin</th></tr></thead>
              <tbody>{(d?.pendingReply || []).slice(0, 8).map(p => <tr key={p.id}><td><button onClick={() => setChatUser({ line_user_id: p.line_user_id })} style={{ padding: '2px 6px', fontSize: 11 }}>{p.display_name || p.line_user_id?.slice(0, 10)}</button></td><td className={Number(p.waiting_minutes) > 5 ? 'score bad' : ''}>{Math.round(p.waiting_minutes)}</td><td className="muted">{p.assigned_admin || '—'}</td></tr>)}
                {!d?.pendingReply?.length && <tr><td colSpan="3" className="muted">ไม่มีงานค้าง 🎉</td></tr>}</tbody></table>
          </div>
        </section>
      </main>
      {chatUser && <ChatModal user={chatUser} onClose={() => setChatUser(null)} />}
    </div>
  );
}

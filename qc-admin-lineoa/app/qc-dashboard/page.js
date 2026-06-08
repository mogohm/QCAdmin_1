'use client';
import { useEffect, useState } from 'react';

const API_KEY = 'PKQC2026SUPERADMIN';
const toISO = d => d.toISOString().slice(0, 10);
const weekAgo = () => toISO(new Date(Date.now() - 7 * 864e5));
const today = () => toISO(new Date());
const sc = v => (v >= 85 ? 'good' : v >= 70 ? 'warn' : 'bad');

const RADAR_AXES = [
  ['greeting_closing', 'Greeting & Closing'],
  ['problem_solving', 'Problem Solving'],
  ['communication_tone', 'Communication & Tone'],
  ['response_time', 'Response Time'],
  ['credit_deposit_withdraw', 'Deposit/Withdraw'],
  ['kyc_process', 'KYC'],
  ['upsell_promotion', 'Upsell & Promotion'],
];
const TIER = { tier1: ['Tier 1 · Excellent (90-100)', 'good'], tier2: ['Tier 2 · Standard (80-89)', 'good'], tier3: ['Tier 3 · Warning (70-79)', 'warn'], tier4: ['Tier 4 · Critical (<70)', 'bad'] };

function Radar({ data }) {
  const size = 260, cx = size / 2, cy = size / 2, R = 95;
  const n = RADAR_AXES.length;
  const pt = (i, r) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  };
  const poly = RADAR_AXES.map(([k], i) => pt(i, R * ((data?.[k] ?? 0) / 100)).join(',')).join(' ');
  return (
    <svg width={size} height={size} style={{ overflow: 'visible' }}>
      {[0.25, 0.5, 0.75, 1].map((f, gi) => (
        <polygon key={gi} points={RADAR_AXES.map((_, i) => pt(i, R * f).join(',')).join(' ')}
          fill="none" stroke="#dce6f2" />
      ))}
      {RADAR_AXES.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e8eef6" />; })}
      <polygon points={poly} fill="rgba(9,168,216,.25)" stroke="#0b5cab" strokeWidth="2" />
      {RADAR_AXES.map(([k, label], i) => {
        const [x, y] = pt(i, R + 22);
        return <text key={k} x={x} y={y} fontSize="10" fill="#65758b" textAnchor="middle">{label}<tspan x={x} dy="12" fontWeight="800" fill="#122033">{data?.[k] ?? '—'}</tspan></text>;
      })}
    </svg>
  );
}

function Bar({ label, value, max, cls }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ margin: '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span>{label}</span><b>{value}</b>
      </div>
      <div style={{ background: '#eef3f8', borderRadius: 8, height: 10 }}>
        <div style={{ width: pct + '%', height: 10, borderRadius: 8, background: cls === 'bad' ? '#ef4444' : cls === 'warn' ? '#f59e0b' : 'linear-gradient(90deg,#0b5cab,#09a8d8)' }} />
      </div>
    </div>
  );
}

export default function QCDashboard() {
  const [d, setD] = useState(null);
  const [from, setFrom] = useState(weekAgo());
  const [to, setTo] = useState(today());
  const [tab, setTab] = useState('admin');
  const [loading, setLoading] = useState(false);

  const load = (f = from, t = to) => {
    setLoading(true);
    fetch(`/api/qc/insights?from=${f}&to=${t}`, { headers: { 'x-api-key': API_KEY } })
      .then(r => r.json()).then(setD).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const maxIntent = Math.max(1, ...(d?.intent_distribution || []).map(x => x.n));
  const tierMax = Math.max(1, ...Object.values(d?.commission_distribution || {}));

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">QC<span>Admin</span></div>
        <nav className="nav">
          <a href="/">Dashboard</a>
          <a className="active" href="/qc-dashboard">📊 QC Dashboard</a>
          <a href="/admin">Admin Console</a>
          <a href="/scraper">Scraper</a>
          <a href="/rules">⚙️ QC Rules</a>
          <a href="/docs">Setup Docs</a>
        </nav>
      </aside>

      <main className="main">
        <div className="top">
          <h2 style={{ margin: 0 }}>QC Dashboard <span className="muted" style={{ fontSize: 13 }}>· AI QA Rubric</span></h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 150, margin: 0 }} />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 150, margin: 0 }} />
            <button onClick={() => load()}>{loading ? '...' : 'ดู'}</button>
          </div>
        </div>

        {d?.error && <div className="card" style={{ color: '#ef4444' }}>⚠️ {d.error}<div className="muted">{d.hint}</div></div>}

        {/* KPIs */}
        <div className="grid kpis">
          <div className="card"><div className="kpi-title">คะแนนเฉลี่ย</div><div className={`kpi-value score ${sc(d?.totals?.avg_score || 0)}`}>{d?.totals?.avg_score ?? '—'}</div></div>
          <div className="card"><div className="kpi-title">ตรวจทั้งหมด</div><div className="kpi-value">{d?.totals?.total ?? '—'}</div></div>
          <div className="card"><div className="kpi-title">Fatal Errors</div><div className="kpi-value score bad">{d?.fatal_errors ?? '—'}</div></div>
          <div className="card"><div className="kpi-title">Minor Errors</div><div className="kpi-value score warn">{d?.minor_errors ?? '—'}</div></div>
          <div className="card"><div className="kpi-title">SOP Coverage</div><div className="kpi-value">{d?.sop_coverage?.percent ?? '—'}%</div></div>
          <div className="card"><div className="kpi-title">หมวดอ่อนสุด</div><div className="kpi-value" style={{ fontSize: 18 }}>{d?.bottleneck?.[0]?.intent ?? '—'}</div></div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, margin: '18px 0 12px' }}>
          {[['admin', '👤 Admin'], ['manager', '🧭 Manager'], ['leaderboard', '🏆 Leaderboard'], ['marketing', '📣 Marketing'], ['coaching', '🎓 Coaching']].map(([k, l]) =>
            <button key={k} onClick={() => setTab(k)} style={{ background: tab === k ? undefined : '#fff', color: tab === k ? '#fff' : '#65758b', border: '1px solid #dce6f2' }}>{l}</button>)}
        </div>

        {/* ADMIN */}
        {tab === 'admin' && (
          <div className="grid split">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Skill Radar (เฉลี่ยรายมิติ)</h3>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}><Radar data={d?.skill_radar} /></div>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Commission Tiers</h3>
              {Object.entries(TIER).map(([k, [label, cls]]) =>
                <Bar key={k} label={label} value={d?.commission_distribution?.[k] || 0} max={tierMax} cls={cls} />)}
              <h3>Trend รายวัน</h3>
              <table className="table"><tbody>
                {(d?.trend || []).map(r => <tr key={r.d}><td>{r.d}</td><td><b className={`score ${sc(r.avg_score)}`}>{r.avg_score}</b></td><td className="muted">{r.n} ตรวจ</td></tr>)}
              </tbody></table>
            </div>
          </div>
        )}

        {/* MANAGER */}
        {tab === 'manager' && (
          <div className="grid split">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Category Scores (Bottleneck Analysis)</h3>
              <table className="table">
                <thead><tr><th>หมวด (intent)</th><th>จำนวน</th><th>คะแนนเฉลี่ย</th><th>Fatal</th></tr></thead>
                <tbody>{(d?.category_scores || []).map(c =>
                  <tr key={c.intent}><td>{c.intent}</td><td>{c.n}</td><td><b className={`score ${sc(c.avg_score)}`}>{c.avg_score}</b></td><td className="score bad">{c.fatal || 0}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Intent Distribution</h3>
              {(d?.intent_distribution || []).map(x => <Bar key={x.intent} label={x.intent} value={x.n} max={maxIntent} />)}
              <h3>QA Coverage</h3>
              <p className="muted">ตรวจแล้ว {d?.sop_coverage?.matched ?? 0}/{d?.sop_coverage?.total ?? 0} ({d?.sop_coverage?.percent ?? 0}%) · Fatal {d?.fatal_errors ?? 0} · Minor {d?.minor_errors ?? 0}</p>
            </div>
          </div>
        )}

        {/* LEADERBOARD */}
        {tab === 'leaderboard' && (
          <div className="grid split">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>🏆 Top Performers</h3>
              <table className="table">
                <thead><tr><th>#</th><th>Admin</th><th>ตรวจ</th><th>คะแนน</th><th>Fatal</th></tr></thead>
                <tbody>{(d?.admin_ranking || []).map((a, i) =>
                  <tr key={a.admin}><td>{i + 1}</td><td>{a.admin}</td><td>{a.replies}</td><td><b className={`score ${sc(a.avg_score)}`}>{a.avg_score}</b></td><td className="score bad">{a.fatal || 0}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>📈 Most Improved</h3>
              <table className="table">
                <thead><tr><th>Admin</th><th>ก่อน</th><th>หลัง</th><th>+เพิ่ม</th></tr></thead>
                <tbody>{(d?.most_improved || []).map(a =>
                  <tr key={a.admin}><td>{a.admin}</td><td className="muted">{a.first_half}</td><td><b>{a.second_half}</b></td><td className="score good">+{a.delta}</td></tr>)}
                {!d?.most_improved?.length && <tr><td colSpan="4" className="muted">ยังไม่มีข้อมูลเพียงพอ</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MARKETING */}
        {tab === 'marketing' && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Marketing — Registration / Deposit / Withdraw / KYC / Promotion</h3>
            <div className="grid kpis">
              {['register', 'deposit', 'withdraw', 'kyc', 'promotion'].map(ev => {
                const row = (d?.marketing?.events || []).find(e => e.event_type === ev);
                return <div className="card" key={ev}><div className="kpi-title">{ev}</div><div className="kpi-value">{row?.n ?? 0}</div>{row?.amount ? <div className="muted">฿{row.amount.toLocaleString()}</div> : null}</div>;
              })}
            </div>
          </div>
        )}

        {/* COACHING */}
        {tab === 'coaching' && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>🎓 AI Feedback & Coaching</h3>
            {(d?.coaching_recommendations || []).map(c => {
              const co = c.coaching || {};
              return (
                <div className="case" key={c.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <b>{c.admin || '—'} · <span className={`score ${sc(c.final_score)}`}>{c.final_score}</span> {c.is_fatal && <span className="score bad">FATAL</span>}</b>
                    <span className="muted">{c.intent}</span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 6 }}>
                    <div><b>❓ ลูกค้า:</b> {co.customer_question || '—'}</div>
                    <div><b>💬 แอดมินตอบ:</b> {co.admin_answer || '—'}</div>
                    {co.matched_sop && <div><b>📋 SOP:</b> {co.matched_sop.topic}</div>}
                    <div style={{ color: '#b45309' }}><b>⚠️ เหตุผล:</b> {(co.reasons || []).join(' · ')}</div>
                    {co.suggested_reply && <div style={{ background: '#f0fdf4', borderRadius: 8, padding: 8, marginTop: 6 }}><b>✅ ควรตอบ:</b> {String(co.suggested_reply).slice(0, 240)}</div>}
                  </div>
                </div>
              );
            })}
            {!d?.coaching_recommendations?.length && <p className="muted">ไม่มีเคสที่ต้อง coaching ในช่วงนี้</p>}
          </div>
        )}
      </main>
    </div>
  );
}

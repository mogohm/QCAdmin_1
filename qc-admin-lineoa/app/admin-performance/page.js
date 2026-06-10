'use client';
import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';

const toISO = d => d.toISOString().slice(0, 10);
const sc = v => (v >= 85 ? 'good' : v >= 70 ? 'warn' : 'bad');
const fmtSec = s => { s = Number(s || 0); return s <= 0 ? '—' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`; };

export default function AdminPerformance() {
  const [d, setD] = useState(null);
  const [from, setFrom] = useState(toISO(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(toISO(new Date()));
  const [pick, setPick] = useState(null);

  const load = () => fetch(`/api/dashboard?from=${from}&to=${to}`).then(r => r.json()).then(setD);
  useEffect(() => { load(); }, []);

  const ranking = (d?.ranking || []).filter(a => a.cases > 0);
  const skill = Object.fromEntries((d?.adminCategoryRanking || []).map(a => [a.admin_id, a]));
  const sel = pick ? ranking.find(a => a.id === pick) : null;
  const selSkill = pick ? skill[pick] : null;

  return (
    <div className="shell">
      <Sidebar active="/admin-performance" />
      <main className="main">
        <div className="top"><h2 style={{ margin: 0 }}>Admin Performance</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 150, margin: 0 }} />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 150, margin: 0 }} />
            <button onClick={load}>ดู</button>
          </div>
        </div>

        <section className="grid split">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Ranking</h3>
            <table className="table"><thead><tr><th>#</th><th>Admin</th><th>เคส</th><th>คะแนน</th><th>Resp</th><th>Bad</th></tr></thead>
              <tbody>{ranking.map((a, i) => (
                <tr key={a.id} onClick={() => setPick(a.id)} style={{ cursor: 'pointer', background: pick === a.id ? '#eff6ff' : '' }}>
                  <td>{i + 1}</td><td>{a.member_name}</td><td>{a.cases}</td><td className={`score ${sc(a.avg_score)}`}>{a.avg_score}</td><td>{fmtSec(a.avg_response_sec)}</td><td className="score bad">{a.bad || 0}</td>
                </tr>))}</tbody></table>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Category Score Matrix</h3>
            <table className="table" style={{ fontSize: 12 }}><thead><tr><th>Admin</th><th>Greet</th><th>Solve</th><th>Tone</th><th>Resp</th></tr></thead>
              <tbody>{(d?.adminCategoryRanking || []).map(a => (
                <tr key={a.admin_id}><td>{a.admin}</td>
                  {['greeting_closing', 'problem_solving', 'communication_tone', 'response_time'].map(c => <td key={c} className={`score ${a[c] != null ? sc(a[c]) : ''}`}>{a[c] ?? '—'}</td>)}</tr>))}
                {!d?.adminCategoryRanking?.length && <tr><td colSpan="5" className="muted">ยังไม่มีข้อมูลรายมิติ (จะมีเมื่อมีคะแนนใหม่จาก engine v4)</td></tr>}</tbody></table>
          </div>
        </section>

        {/* drilldown */}
        {sel && (
          <section className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>🔍 {sel.member_name}</h3>
            <section className="grid kpis" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
              <div className="card"><div className="kpi-title">คะแนนเฉลี่ย</div><div className={`kpi-value score ${sc(sel.avg_score)}`}>{sel.avg_score}</div></div>
              <div className="card"><div className="kpi-title">เคส</div><div className="kpi-value">{sel.cases}</div></div>
              <div className="card"><div className="kpi-title">ตอบเฉลี่ย</div><div className="kpi-value">{fmtSec(sel.avg_response_sec)}</div></div>
              <div className="card"><div className="kpi-title">ดี (≥85)</div><div className="kpi-value score good">{sel.good || 0}</div></div>
              <div className="card"><div className="kpi-title">ต่ำ (&lt;70)</div><div className="kpi-value score bad">{sel.bad || 0}</div></div>
              <div className="card"><div className="kpi-title">สมัคร/ยอดฝาก</div><div className="kpi-value" style={{ fontSize: 16 }}>{sel.reg_count || 0} / ฿{Number(sel.deposit_sum || 0).toLocaleString()}</div></div>
            </section>
            {selSkill && <div style={{ marginTop: 12 }}>
              <b style={{ fontSize: 13 }}>จุดที่ต้องโค้ช:</b>
              {['greeting_closing', 'problem_solving', 'communication_tone', 'response_time'].filter(c => selSkill[c] != null && selSkill[c] < 70).map(c => <span key={c} className="badge" style={{ marginLeft: 6, background: '#fef2f2', color: '#dc2626' }}>{c} ({selSkill[c]})</span>)}
              {['greeting_closing', 'problem_solving', 'communication_tone', 'response_time'].every(c => selSkill[c] == null || selSkill[c] >= 70) && <span className="muted" style={{ marginLeft: 6 }}>ผ่านทุกมิติ 👍</span>}
            </div>}
          </section>
        )}
        {!sel && <div className="muted" style={{ marginTop: 12 }}>คลิกแถว admin เพื่อดูรายละเอียด</div>}
      </main>
    </div>
  );
}

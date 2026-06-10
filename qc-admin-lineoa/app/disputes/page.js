'use client';
import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';

const sc = v => (v >= 85 ? 'good' : v >= 70 ? 'warn' : 'bad');
const A = v => { try { return Array.isArray(v) ? v : (JSON.parse(v) || []); } catch { return []; } };

export default function Disputes() {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [note, setNote] = useState({});
  const [newScore, setNewScore] = useState({});
  const [msg, setMsg] = useState('');

  const load = () => {
    const p = filter ? `?status=${filter}` : '';
    fetch('/api/qc-disputes' + p).then(r => r.json()).then(d => { setRows(d.disputes || []); setCounts(d.counts || []); });
  };
  useEffect(() => { load(); }, [filter]);

  const review = async (id, status) => {
    const body = { status, reviewer_note: note[id] || '' };
    if (status === 'approved' && newScore[id] != null && newScore[id] !== '') body.new_score = parseInt(newScore[id]);
    const r = await fetch(`/api/qc-disputes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    setMsg(j.ok ? `✓ ${status}` : '⚠️ ' + (j.error || 'error')); load(); setTimeout(() => setMsg(''), 2000);
  };
  const cmap = Object.fromEntries(counts.map(c => [c.status, c.n]));

  return (
    <div className="shell">
      <Sidebar active="/disputes" />
      <main className="main">
        <div className="top"><h2 style={{ margin: 0 }}>Dispute Review — โต้แย้งผล AI</h2></div>

        <section className="grid kpis" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 14 }}>
          <div className="card"><div className="kpi-title">Pending</div><div className="kpi-value score warn">{cmap.pending || 0}</div></div>
          <div className="card"><div className="kpi-title">Approved</div><div className="kpi-value score good">{cmap.approved || 0}</div></div>
          <div className="card"><div className="kpi-title">Rejected</div><div className="kpi-value score bad">{cmap.rejected || 0}</div></div>
        </section>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {['pending', 'approved', 'rejected', ''].map(s => <button key={s || 'all'} onClick={() => setFilter(s)} style={filter === s ? {} : { background: '#fff', color: '#65758b', border: '1px solid #dce6f2' }}>{s || 'ทั้งหมด'}</button>)}
        </div>
        {msg && <div className="card" style={{ marginBottom: 12, color: msg[0] === '⚠' ? '#ef4444' : '#16a34a' }}>{msg}</div>}

        {rows.map(d => (
          <div key={d.id} className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <div><b>{d.admin_name || '—'}</b> <span className="muted">· {d.intent || '-'} · {new Date(d.created_at).toLocaleString('th-TH')}</span></div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className={`score ${sc(d.old_score)}`} style={{ fontSize: 18 }}>{d.old_score}</span>
                {d.new_score != null && <><span className="muted">→</span><span className={`score ${sc(d.new_score)}`} style={{ fontSize: 18 }}>{d.new_score}</span></>}
                <span className="badge" style={{ background: d.status === 'pending' ? '#fef9c3' : d.status === 'approved' ? '#dcfce7' : '#fee2e2', color: d.status === 'pending' ? '#a16207' : d.status === 'approved' ? '#16a34a' : '#dc2626' }}>{d.status}</span>
              </div>
            </div>

            <div className="cols" style={{ marginTop: 10 }}>
              <div>
                <div style={qa}><b>❓ คำถามลูกค้า</b><div>{d.customer_question || '—'}</div></div>
                <div style={qa}><b>💬 คำตอบแอดมิน</b><div>{d.admin_answer || '—'}</div></div>
              </div>
              <div>
                {d.matched_sop_topic && <div style={qa}><b>📋 Matched SOP</b><div>{d.matched_sop_topic}</div>{d.expected_sop_answer && <div style={{ color: '#16a34a', fontSize: 12, marginTop: 3 }}>ควรตอบ: {String(d.expected_sop_answer).slice(0, 140)}…</div>}</div>}
                <div style={qa}><b>🤖 AI ให้เหตุผล</b><div style={{ color: '#dc2626', fontSize: 12 }}>{A(d.ai_reason).slice(0, 4).join(' · ') || '—'}</div></div>
              </div>
            </div>

            <div style={{ background: '#fff7ed', borderLeft: '3px solid #f59e0b', borderRadius: '0 8px 8px 0', padding: 10, margin: '8px 0', fontSize: 13 }}><b>⚖️ แอดมินโต้แย้ง:</b> {d.reason}</div>
            {d.reviewer_note && <div style={{ fontSize: 12, color: '#555' }}>📝 Manager: {d.reviewer_note} {d.reviewed_by && <span className="muted">({d.reviewed_by} · {d.reviewed_at ? new Date(d.reviewed_at).toLocaleString('th-TH') : ''})</span>}</div>}

            {d.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                <input placeholder="คะแนนใหม่ (0-100)" type="number" min="0" max="100" value={newScore[d.id] ?? ''} onChange={e => setNewScore({ ...newScore, [d.id]: e.target.value })} style={{ width: 150, margin: 0 }} />
                <input placeholder="หมายเหตุ Manager" value={note[d.id] ?? ''} onChange={e => setNote({ ...note, [d.id]: e.target.value })} style={{ flex: 1, margin: 0, minWidth: 180 }} />
                <button onClick={() => review(d.id, 'approved')} style={{ background: '#16a34a' }}>อนุมัติ + แก้คะแนน</button>
                <button onClick={() => review(d.id, 'rejected')} style={{ background: '#ef4444' }}>ปฏิเสธ</button>
              </div>
            )}
          </div>
        ))}
        {!rows.length && <div className="card muted">ไม่มี dispute</div>}
      </main>
    </div>
  );
}
const qa = { background: '#f8fafc', borderRadius: 8, padding: '8px 10px', marginBottom: 6, fontSize: 13 };

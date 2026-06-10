'use client';
import { useEffect, useState } from 'react';

const sc = v => (v >= 85 ? 'good' : v >= 70 ? 'warn' : 'bad');

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
    setMsg(j.ok ? `อัปเดตเป็น ${status}` : '⚠️ ' + (j.error || 'error'));
    load(); setTimeout(() => setMsg(''), 2000);
  };

  const cmap = Object.fromEntries(counts.map(c => [c.status, c.n]));

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">QC<span>Admin</span></div>
        <nav className="nav">
          <a href="/">Dashboard</a>
          <a href="/qc-dashboard">📊 QC Dashboard</a>
          <a href="/sop">📚 SOP</a>
          <a className="active" href="/disputes">⚖️ Disputes</a>
          <a href="/admin">Admin Console</a>
        </nav>
      </aside>
      <main className="main">
        <div className="top"><h2 style={{ margin: 0 }}>Dispute Queue — โต้แย้งผล AI</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {['pending', 'approved', 'rejected', ''].map(s => <button key={s || 'all'} onClick={() => setFilter(s)} style={{ background: filter === s ? undefined : '#fff', color: filter === s ? '#fff' : '#65758b', border: '1px solid #dce6f2' }}>{s || 'ทั้งหมด'} {s ? `(${cmap[s] || 0})` : ''}</button>)}
          </div>
        </div>
        {msg && <div className="card" style={{ marginBottom: 12, color: msg[0] === '⚠' ? '#ef4444' : '#16a34a' }}>{msg}</div>}

        {rows.map(d => (
          <div key={d.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <b>{d.admin_name || '—'}</b> <span className="muted">· {d.intent || '-'}</span>
                <span style={{ marginLeft: 8 }} className={`score ${sc(d.old_score)}`}>คะแนนเดิม {d.old_score}</span>
                {d.new_score != null && <span style={{ marginLeft: 8 }} className={`score ${sc(d.new_score)}`}>→ ใหม่ {d.new_score}</span>}
              </div>
              <span className="badge" style={{ background: d.status === 'pending' ? '#fef9c3' : d.status === 'approved' ? '#dcfce7' : '#fee2e2', color: d.status === 'pending' ? '#a16207' : d.status === 'approved' ? '#16a34a' : '#dc2626' }}>{d.status}</span>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, margin: '8px 0', fontSize: 13 }}><b>เหตุผลที่โต้แย้ง:</b> {d.reason}</div>
            {d.reviewer_note && <div style={{ fontSize: 12, color: '#555' }}>📝 Manager: {d.reviewer_note} {d.reviewed_by && <span className="muted">({d.reviewed_by})</span>}</div>}
            {d.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                <input placeholder="คะแนนใหม่ (ถ้าอนุมัติ)" type="number" min="0" max="100" value={newScore[d.id] ?? ''} onChange={e => setNewScore({ ...newScore, [d.id]: e.target.value })} style={{ width: 150, margin: 0 }} />
                <input placeholder="หมายเหตุ Manager" value={note[d.id] ?? ''} onChange={e => setNote({ ...note, [d.id]: e.target.value })} style={{ flex: 1, margin: 0, minWidth: 180 }} />
                <button onClick={() => review(d.id, 'approved')} style={{ background: '#16a34a' }}>อนุมัติ</button>
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

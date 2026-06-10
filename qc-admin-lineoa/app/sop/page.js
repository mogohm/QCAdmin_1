'use client';
import { useEffect, useState } from 'react';

const empty = { topic: '', question: '', answer: '', intent: '', category_code: '', keywords: '', required_keywords: '', forbidden_keywords: '', escalation: false, is_active: true };
const joinKw = v => Array.isArray(v) ? v.join(', ') : (v || '');

export default function SOPManager() {
  const [list, setList] = useState([]);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState('');
  const [intent, setIntent] = useState('');
  const [edit, setEdit] = useState(null); // object being edited (null=none, {}=new)
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    const p = new URLSearchParams(); if (q) p.set('q', q); if (intent) p.set('intent', intent);
    fetch('/api/sop?' + p).then(r => r.json()).then(d => { setList(d.sops || []); setCats(d.categories || []); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const e = edit;
    const payload = { ...e, keywords: e.keywords, required_keywords: e.required_keywords, forbidden_keywords: e.forbidden_keywords };
    const url = e.id ? `/api/sop/${e.id}` : '/api/sop';
    const method = e.id ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (j.ok) { setMsg('บันทึกแล้ว'); setEdit(null); load(); } else setMsg('⚠️ ' + (j.error || 'error'));
    setTimeout(() => setMsg(''), 2500);
  };
  const del = async (id) => {
    if (!confirm('ลบ SOP นี้?')) return;
    const r = await fetch(`/api/sop/${id}`, { method: 'DELETE' }); const j = await r.json();
    if (j.ok) load();
  };
  const toggleActive = async (s) => { await fetch(`/api/sop/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !s.is_active }) }); load(); };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">QC<span>Admin</span></div>
        <nav className="nav">
          <a href="/">Dashboard</a>
          <a href="/qc-dashboard">📊 QC Dashboard</a>
          <a className="active" href="/sop">📚 SOP จัดการ</a>
          <a href="/admin">Admin Console</a>
          <a href="/scraper">Scraper</a>
          <a href="/rules">⚙️ QC Rules</a>
        </nav>
      </aside>

      <main className="main">
        <div className="top">
          <h2 style={{ margin: 0 }}>SOP Knowledge Base <span className="muted" style={{ fontSize: 13 }}>· {list.length} รายการ</span></h2>
          <button onClick={() => setEdit({ ...empty })}>+ เพิ่ม SOP</button>
        </div>

        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input placeholder="ค้นหา topic/คำตอบ..." value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} style={{ margin: 0, flex: 1 }} />
          <select value={intent} onChange={e => setIntent(e.target.value)} style={{ margin: 0, width: 180 }}>
            <option value="">ทุก intent</option>
            {cats.map(c => <option key={c.code} value={c.code}>{c.code} ({c.name})</option>)}
          </select>
          <button onClick={load}>{loading ? '...' : 'ค้นหา'}</button>
        </div>
        {msg && <div className="card" style={{ marginBottom: 12, color: msg[0] === '⚠' ? '#ef4444' : '#16a34a' }}>{msg}</div>}

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead><tr><th>Topic</th><th>Intent</th><th>คำตอบ</th><th>Keywords</th><th>Esc</th><th>สถานะ</th><th></th></tr></thead>
            <tbody>
              {list.map(s => (
                <tr key={s.id} style={{ opacity: s.is_active ? 1 : .5 }}>
                  <td style={{ fontWeight: 600, maxWidth: 180 }}>{s.topic}</td>
                  <td><span className="badge" style={{ fontSize: 11 }}>{s.intent || '-'}</span></td>
                  <td style={{ maxWidth: 260, fontSize: 12, color: '#555' }}>{String(s.answer).slice(0, 80)}…</td>
                  <td style={{ fontSize: 11, color: '#888', maxWidth: 140 }}>{joinKw(s.keywords).slice(0, 40)}</td>
                  <td>{s.escalation ? '🔺' : ''}</td>
                  <td><button onClick={() => toggleActive(s)} style={{ background: s.is_active ? '#16a34a' : '#9ca3af', padding: '4px 10px', fontSize: 11 }}>{s.is_active ? 'active' : 'off'}</button></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEdit({ ...s, keywords: joinKw(s.keywords), required_keywords: joinKw(s.required_keywords), forbidden_keywords: joinKw(s.forbidden_keywords) })} style={{ padding: '4px 10px', fontSize: 11 }}>แก้</button>{' '}
                    <button onClick={() => del(s.id)} style={{ background: '#ef4444', padding: '4px 10px', fontSize: 11 }}>ลบ</button>
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>ไม่พบ SOP</td></tr>}
            </tbody>
          </table>
        </div>

        {edit && (
          <div onClick={() => setEdit(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'grid', placeItems: 'center' }}>
            <div onClick={e => e.stopPropagation()} className="card" style={{ width: 'min(620px,94vw)', maxHeight: '90vh', overflow: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>{edit.id ? 'แก้ไข SOP' : 'เพิ่ม SOP'}</h3>
              {[['topic', 'Topic / แนวคำถาม'], ['question', 'Question'], ['intent', 'Intent (deposit/withdraw/...)'], ['category_code', 'Category code']].map(([k, label]) =>
                <div key={k}><label style={{ fontSize: 12, color: '#666' }}>{label}</label><input value={edit[k] || ''} onChange={e => setEdit({ ...edit, [k]: e.target.value })} /></div>)}
              <label style={{ fontSize: 12, color: '#666' }}>Answer (คำตอบมาตรฐาน)</label>
              <textarea rows={5} value={edit.answer || ''} onChange={e => setEdit({ ...edit, answer: e.target.value })} />
              {[['keywords', 'Keywords (คั่นด้วย ,)'], ['required_keywords', 'Required keywords'], ['forbidden_keywords', 'Forbidden keywords']].map(([k, label]) =>
                <div key={k}><label style={{ fontSize: 12, color: '#666' }}>{label}</label><input value={edit[k] || ''} onChange={e => setEdit({ ...edit, [k]: e.target.value })} /></div>)}
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '10px 0' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', width: 'auto' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!edit.escalation} onChange={e => setEdit({ ...edit, escalation: e.target.checked })} /> Escalation</label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', width: 'auto' }}><input type="checkbox" style={{ width: 'auto' }} checked={edit.is_active !== false} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} /> Active</label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={save}>บันทึก</button>
                <button onClick={() => setEdit(null)} style={{ background: '#9ca3af' }}>ยกเลิก</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

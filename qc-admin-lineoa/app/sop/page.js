'use client';
import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';

// TAG editor — keyword แบบ chip ลบได้ + เพิ่มได้
function TagEditor({ value, onChange, placeholder, color = '#0b5cab' }) {
  const tags = Array.isArray(value) ? value : String(value || '').split(',').map(s => s.trim()).filter(Boolean);
  const [inp, setInp] = useState('');
  const add = () => { const v = inp.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setInp(''); };
  const rm = (t) => onChange(tags.filter(x => x !== t));
  return (
    <div style={{ border: '1px solid #dce6f2', borderRadius: 10, padding: 8, margin: '6px 0 12px', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
      {tags.map(t => <span key={t} style={{ background: color + '18', color, borderRadius: 100, padding: '2px 8px', fontSize: 12, display: 'inline-flex', gap: 5, alignItems: 'center' }}>{t}<span onClick={() => rm(t)} style={{ cursor: 'pointer', fontWeight: 800 }}>×</span></span>)}
      <input value={inp} onChange={e => setInp(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} onBlur={add} placeholder={placeholder} style={{ border: 0, outline: 'none', flex: 1, minWidth: 100, margin: 0, padding: 4, background: 'transparent' }} />
    </div>
  );
}

const empty = { topic: '', question: '', answer: '', intent: '', category_code: '', keywords: '', required_keywords: '', forbidden_keywords: '', escalation: false, is_active: true };
const joinKw = v => Array.isArray(v) ? v.join(', ') : (v || '');

export default function SOPManager() {
  const [list, setList] = useState([]);
  const [cats, setCats] = useState([]);
  const [summary, setSummary] = useState({});
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(''); // intent tab
  const [activeFilter, setActiveFilter] = useState('all');
  const [edit, setEdit] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    const p = new URLSearchParams(); if (q) p.set('q', q); if (tab) p.set('intent', tab);
    fetch('/api/sop?' + p).then(r => r.json()).then(d => { setList(d.sops || []); setCats(d.categories || []); setSummary(d.summary || {}); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [tab]);

  const filtered = list.filter(s => activeFilter === 'all' || (activeFilter === 'active' ? s.is_active : !s.is_active));

  const save = async () => {
    const e = edit;
    const url = e.id ? `/api/sop/${e.id}` : '/api/sop';
    const r = await fetch(url, { method: e.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) });
    const j = await r.json();
    if (j.ok) { setMsg('✓ บันทึกแล้ว'); setEdit(null); load(); } else setMsg('⚠️ ' + (j.error || 'error'));
    setTimeout(() => setMsg(''), 2500);
  };
  const del = async id => { if (!confirm('ลบ SOP นี้?')) return; await fetch(`/api/sop/${id}`, { method: 'DELETE' }); load(); };
  const dup = (s) => setEdit({ ...s, id: null, topic: s.topic + ' (copy)', keywords: joinKw(s.keywords), required_keywords: joinKw(s.required_keywords), forbidden_keywords: joinKw(s.forbidden_keywords) });
  const setActive = async (id, v) => { await fetch(`/api/sop/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: v }) }); load(); };
  const bulk = async (v) => { for (const id of sel) await fetch(`/api/sop/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: v }) }); setSel(new Set()); load(); };
  const toggleSel = id => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };

  return (
    <AppShell title="SOP Knowledge Base"
      subtitle={`${summary.active ?? 0}/${summary.total ?? 0} active · escalation ${summary.escalation ?? 0} · ขาด required keyword ${summary.missing_required ?? 0}`}
      actions={<button onClick={() => setEdit({ ...empty })}>+ เพิ่ม SOP</button>}>
      <>
        {/* import status card */}
        <section className="grid kpis" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 12 }}>
          <div className="card"><div className="kpi-title">ทั้งหมด</div><div className="kpi-value">{summary.total ?? 0}</div></div>
          <div className="card"><div className="kpi-title">Active</div><div className="kpi-value score good">{summary.active ?? 0}</div></div>
          <div className="card"><div className="kpi-title">Escalation</div><div className="kpi-value">{summary.escalation ?? 0}</div></div>
          <div className="card"><div className="kpi-title">⚠️ ขาด Required KW</div><div className="kpi-value score warn">{summary.missing_required ?? 0}</div></div>
        </section>

        {/* category tabs */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <button onClick={() => setTab('')} style={tab === '' ? {} : ghost}>ทั้งหมด</button>
            {cats.map(c => <button key={c.code} onClick={() => setTab(c.code)} style={tab === c.code ? {} : ghost}>{c.code}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder="ค้นหา topic/คำตอบ…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} style={{ margin: 0, flex: 1 }} />
            <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)} style={{ margin: 0, width: 140 }}><option value="all">ทุกสถานะ</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
            <button onClick={load}>{loading ? '...' : 'ค้นหา'}</button>
          </div>
          {sel.size > 0 && <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}><span className="muted">เลือก {sel.size}:</span><button onClick={() => bulk(true)} style={{ background: '#16a34a' }}>เปิดใช้</button><button onClick={() => bulk(false)} style={{ background: '#9ca3af' }}>ปิด</button></div>}
        </div>
        {msg && <div className="card" style={{ marginBottom: 12, color: msg[0] === '⚠' ? '#ef4444' : '#16a34a' }}>{msg}</div>}

        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table" style={{ fontSize: 12 }}>
            <thead><tr><th></th><th>Category</th><th>Intent</th><th>Topic</th><th>Answer</th><th>Required KW</th><th>Forbidden</th><th>Esc</th><th>Used</th><th>Active</th><th></th></tr></thead>
            <tbody>{filtered.map(s => (
              <tr key={s.id} style={{ opacity: s.is_active ? 1 : .5 }}>
                <td><input type="checkbox" style={{ width: 'auto' }} checked={sel.has(s.id)} onChange={() => toggleSel(s.id)} /></td>
                <td>{s.category_code || '-'}</td>
                <td><span className="badge" style={{ fontSize: 10 }}>{s.intent || '-'}</span></td>
                <td style={{ fontWeight: 600, maxWidth: 150 }}>{s.topic}</td>
                <td style={{ maxWidth: 200, color: '#555' }}>{String(s.answer).slice(0, 60)}…</td>
                <td style={{ maxWidth: 120, color: joinKw(s.required_keywords) ? '#555' : '#ef4444' }}>{joinKw(s.required_keywords).slice(0, 30) || '⚠️ ไม่มี'}</td>
                <td style={{ maxWidth: 100, color: '#888' }}>{joinKw(s.forbidden_keywords).slice(0, 24)}</td>
                <td>{s.escalation ? '🔺' : ''}</td>
                <td>{s.used_count || 0}</td>
                <td><button onClick={() => setActive(s.id, !s.is_active)} style={{ background: s.is_active ? '#16a34a' : '#9ca3af', padding: '3px 9px', fontSize: 10 }}>{s.is_active ? 'ON' : 'off'}</button></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button onClick={() => setEdit({ ...s, keywords: joinKw(s.keywords), required_keywords: joinKw(s.required_keywords), forbidden_keywords: joinKw(s.forbidden_keywords) })} style={{ padding: '3px 8px', fontSize: 10 }}>แก้</button>{' '}
                  <button onClick={() => dup(s)} style={{ padding: '3px 8px', fontSize: 10, background: '#64748b' }}>คัดลอก</button>{' '}
                  <button onClick={() => del(s.id)} style={{ background: '#ef4444', padding: '3px 8px', fontSize: 10 }}>ลบ</button>
                </td>
              </tr>))}
              {!filtered.length && <tr><td colSpan="11" className="muted" style={{ textAlign: 'center', padding: 20 }}>ไม่พบ SOP</td></tr>}
            </tbody>
          </table>
        </div>

        {/* edit drawer */}
        {edit && (
          <div onClick={() => setEdit(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000 }}>
            <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(560px,96vw)', background: '#fff', overflow: 'auto', padding: 22, boxShadow: '-4px 0 24px rgba(0,0,0,.2)' }}>
              <h3 style={{ marginTop: 0 }}>{edit.id ? 'แก้ไข SOP' : 'เพิ่ม SOP'}</h3>
              {edit.id && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>ใช้งานแล้ว {edit.used_count || 0} ครั้ง · อัปเดต {edit.updated_at ? new Date(edit.updated_at).toLocaleString('th-TH') : '-'}</div>}
              {[['topic', 'Topic / แนวคำถาม'], ['question', 'Question Pattern'], ['intent', 'Intent'], ['category_code', 'Category code']].map(([key, label]) =>
                <div key={key}><label style={lbl}>{label}</label><input value={edit[key] || ''} onChange={e => setEdit({ ...edit, [key]: e.target.value })} /></div>)}
              <label style={lbl}>Answer (คำตอบมาตรฐาน)</label>
              <textarea rows={5} value={edit.answer || ''} onChange={e => setEdit({ ...edit, answer: e.target.value })} />
              <label style={lbl}>✅ Required Keywords — คำตอบที่ดีควรมี (Enter เพื่อเพิ่ม)</label>
              <TagEditor value={edit.required_keywords} onChange={v => setEdit({ ...edit, required_keywords: v })} placeholder="พิมพ์แล้ว Enter" color="#16a34a" />
              <label style={lbl}>🚫 Forbidden Keywords — ห้ามมีในคำตอบ</label>
              <TagEditor value={edit.forbidden_keywords} onChange={v => setEdit({ ...edit, forbidden_keywords: v })} placeholder="พิมพ์แล้ว Enter" color="#ef4444" />
              <label style={lbl}>🔎 Keywords — match คำถามลูกค้า</label>
              <TagEditor value={edit.keywords} onChange={v => setEdit({ ...edit, keywords: v })} placeholder="พิมพ์แล้ว Enter" />
              <div style={{ display: 'flex', gap: 16, margin: '10px 0' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', width: 'auto' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!edit.escalation} onChange={e => setEdit({ ...edit, escalation: e.target.checked })} /> Escalation</label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', width: 'auto' }}><input type="checkbox" style={{ width: 'auto' }} checked={edit.is_active !== false} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} /> Active</label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button onClick={save}>บันทึก</button><button onClick={() => setEdit(null)} style={{ background: '#9ca3af' }}>ปิด</button></div>
            </div>
          </div>
        )}
      </>
    </AppShell>
  );
}
const ghost = { background: '#fff', color: '#65758b', border: '1px solid #dce6f2' };
const lbl = { fontSize: 12, color: '#666' };

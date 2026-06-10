'use client';
import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';

const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const empty = () => ({ title: '', description: '', event_type: 'bank_delay', affects_sla: true, starts_at: nowLocal(), ends_at: '' });

export default function SystemEvents() {
  const [events, setEvents] = useState([]);
  const [active, setActive] = useState([]);
  const [form, setForm] = useState(empty());
  const [msg, setMsg] = useState('');

  const load = () => fetch('/api/system-events').then(r => r.json()).then(d => { setEvents(d.events || []); setActive(d.active || []); });
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.title) { setMsg('⚠️ ใส่ชื่อ event'); return; }
    const body = { ...form, starts_at: new Date(form.starts_at).toISOString(), ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null };
    const r = await fetch('/api/system-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (j.ok) { setMsg('✓ สร้าง event แล้ว'); setForm(empty()); load(); } else setMsg('⚠️ ' + (j.error || 'error'));
    setTimeout(() => setMsg(''), 2500);
  };
  const deactivate = async (id) => { await fetch(`/api/system-events/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: false }) }); load(); };

  const isLive = e => e.is_active && (!e.ends_at || new Date(e.ends_at) >= new Date());

  return (
    <div className="shell">
      <Sidebar active="/system-events" />
      <main className="main">
        <div className="top"><div><h2 style={{ margin: 0 }}>System Events</h2><div className="muted" style={{ fontSize: 12 }}>ช่วงระบบ/ธนาคารผิดปกติ → ยกเว้น SLA</div></div>
          <span className="badge" style={{ background: active.length ? '#fee2e2' : '#dcfce7', color: active.length ? '#dc2626' : '#16a34a' }}>{active.length} active</span>
        </div>

        <section className="grid split">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>+ สร้าง Event</h3>
            <label style={lbl}>ชื่อ Event</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="เช่น ธนาคารกรุงไทยล่ม" />
            <label style={lbl}>ประเภท</label>
            <select value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })}>
              {['bank_delay', 'system_down', 'maintenance', 'network', 'other'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <label style={lbl}>รายละเอียด / เหตุผล</label><textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="cols">
              <div><label style={lbl}>เริ่ม</label><input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} /></div>
              <div><label style={lbl}>สิ้นสุด (เว้นว่าง = ต่อเนื่อง)</label><input type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} /></div>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', width: 'auto', margin: '8px 0' }}><input type="checkbox" style={{ width: 'auto' }} checked={form.affects_sla} onChange={e => setForm({ ...form, affects_sla: e.target.checked })} /> กระทบ SLA (ไม่หัก response time เต็ม)</label>
            {msg && <div style={{ color: msg[0] === '⚠' ? '#ef4444' : '#16a34a', marginBottom: 8 }}>{msg}</div>}
            <button onClick={create}>สร้าง Event</button>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Events ({events.length})</h3>
            {events.map(e => (
              <div key={e.id} className="case" style={{ borderLeft: `3px solid ${isLive(e) ? '#ef4444' : '#cbd5e1'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b>{e.title}</b>
                  {isLive(e) ? <button onClick={() => deactivate(e.id)} style={{ background: '#ef4444', padding: '4px 10px', fontSize: 11 }}>ปิด</button> : <span className="muted" style={{ fontSize: 11 }}>จบแล้ว</span>}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>{e.event_type} {e.affects_sla && '· 🛡️ SLA exception'}</div>
                {e.description && <div style={{ fontSize: 12, color: '#555' }}>{e.description}</div>}
                <div style={{ fontSize: 11, color: '#888' }}>{new Date(e.starts_at).toLocaleString('th-TH')} → {e.ends_at ? new Date(e.ends_at).toLocaleString('th-TH') : 'ต่อเนื่อง'}</div>
              </div>
            ))}
            {!events.length && <div className="muted">ยังไม่มี event</div>}
          </div>
        </section>
      </main>
    </div>
  );
}
const lbl = { fontSize: 12, color: '#666' };

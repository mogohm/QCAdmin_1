'use client';
import { useEffect, useState, useRef } from 'react';

const today    = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

function statusColor(s) {
  return s === 'done' ? '#22c55e' : s === 'running' ? '#2196f3'
       : s === 'error' ? '#ef4444' : s === 'cancelled' ? '#9ca3af' : '#f59e0b';
}
function statusLabel(s) {
  return { pending: '⏳ รอ scraper รับงาน', running: '🔄 กำลังดึงข้อมูล', done: '✅ เสร็จแล้ว', error: '❌ ผิดพลาด', cancelled: '🚫 ยกเลิก' }[s] || s;
}
function fmtCountdown(ms) {
  if (!ms || ms <= 0) return '0:00';
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function readCfg() {
  try { return JSON.parse(localStorage.getItem('qc_schedule') || 'null'); } catch { return null; }
}

export default function ScraperPage() {
  const [key, setKey]         = useState('');
  const [dateFrom, setDateFrom] = useState(yesterday());
  const [dateTo, setDateTo]   = useState(today());
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState('');

  // schedule
  const [cfg, setCfg]         = useState(null);   // localStorage schedule config
  const [intervalMin, setIntervalMin] = useState(30);
  const [countdown, setCountdown]     = useState(0);
  const tickRef = useRef(null);
  const pollRef = useRef(null);

  // ---- load ----
  const loadJobs = async () => {
    try {
      const r  = await fetch('/api/scraper/job');
      const data = await r.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => {
    // Load saved key
    const saved = localStorage.getItem('qc_api_key') || '';
    if (saved) setKey(saved);

    // Load schedule config
    const c = readCfg();
    if (c) { setCfg(c); setIntervalMin(c.intervalMin || 30); }

    loadJobs();
    pollRef.current = setInterval(loadJobs, 3000);

    // countdown tick
    tickRef.current = setInterval(() => {
      const c2 = readCfg();
      if (c2?.on && c2.nextRun) {
        setCountdown(Math.max(0, c2.nextRun - Date.now()));
      }
    }, 1000);

    return () => { clearInterval(pollRef.current); clearInterval(tickRef.current); };
  }, []);

  useEffect(() => { if (key) localStorage.setItem('qc_api_key', key); }, [key]);

  // ---- submit job ----
  async function submitJob(from, to, quiet = false) {
    if (!key) { setMsg('ใส่ ADMIN_API_KEY ก่อน'); return false; }
    try {
      const r = await fetch('/api/scraper/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ date_from: from, date_to: to }),
      });
      const d = await r.json();
      if (d.ok) { if (!quiet) setMsg('✅ สร้าง job แล้ว'); loadJobs(); return true; }
      setMsg('❌ ' + d.error); return false;
    } catch (e) { setMsg('❌ ' + e.message); return false; }
  }

  async function startJob() {
    setLoading(true); setMsg('');
    await submitJob(dateFrom, dateTo);
    setLoading(false);
  }

  // ---- schedule ----
  function enableSchedule() {
    if (!key) { setMsg('ใส่ ADMIN_API_KEY ก่อน'); return; }
    const intervalMs = intervalMin * 60 * 1000;
    const nextRun    = Date.now() + intervalMs;
    const newCfg     = { on: true, key, intervalMin, intervalMs, nextRun };
    localStorage.setItem('qc_schedule', JSON.stringify(newCfg));
    setCfg(newCfg);
    setCountdown(intervalMs);
    setMsg('');
    // สร้าง job ทันที
    submitJob(today(), today(), true).then(ok => {
      if (ok) setMsg(`✅ สร้าง job ทันที — รันครั้งหน้าใน ${intervalMin} นาที`);
    });
  }

  function disableSchedule() {
    const newCfg = { on: false };
    localStorage.setItem('qc_schedule', JSON.stringify(newCfg));
    setCfg(newCfg);
    setMsg('⏹️ ปิด Auto-Schedule แล้ว');
  }

  const scheduleOn = cfg?.on === true;
  const activeJob  = jobs.find(j => j.status === 'running' || j.status === 'pending');

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">QC<span>Admin</span></div>
        <nav className="nav">
          <a href="/">Dashboard</a>
          <a href="/admin">Admin Console</a>
          <a className="active" href="/scraper">Scraper</a>
          <a href="/docs">Setup Docs</a>
          <a href="/PROJECT_DOCS.html" target="_blank">📄 Project Docs</a>
        </nav>
        {/* sidebar schedule status */}
        <div style={{ marginTop: 'auto', padding: '16px 0', fontSize: 12 }}>
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: scheduleOn ? '#f0fdf4' : '#f8fafc',
            border: `1px solid ${scheduleOn ? '#86efac' : '#e5e7eb'}`,
          }}>
            <div style={{ fontWeight: 600, color: scheduleOn ? '#16a34a' : '#888', marginBottom: 4 }}>
              {scheduleOn ? '⏰ Auto-Schedule ON' : '⏰ Auto-Schedule OFF'}
            </div>
            {scheduleOn && (
              <>
                <div style={{ color: '#555' }}>ทุก {cfg.intervalMin} นาที</div>
                <div style={{ color: '#2196f3', fontWeight: 700, fontFamily: 'monospace', fontSize: 16, marginTop: 4 }}>
                  {fmtCountdown(countdown)}
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="top">
          <div>
            <h1>Scraper Control</h1>
            <p className="muted">ดึงข้อความแอดมินจาก chat.line.biz เข้าระบบ QC</p>
          </div>
        </div>

        {/* ===== ACTIVE JOB STATUS (ถ้ามี) ===== */}
        {activeJob ? (
          <div style={{
            background: activeJob.status === 'running' ? '#eff6ff' : '#fffbeb',
            border: `2px solid ${activeJob.status === 'running' ? '#2196f3' : '#f59e0b'}`,
            borderRadius: 12, padding: 20, marginBottom: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: statusColor(activeJob.status) }}>
                {statusLabel(activeJob.status)}
              </div>
              <span style={{ fontSize: 12, color: '#666' }}>{activeJob.date_from} — {activeJob.date_to}</span>
            </div>
            {activeJob.total_chats > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span>บันทึก {activeJob.logged_count} / {activeJob.total_chats} chats</span>
                  <b>{Math.round((activeJob.logged_count / activeJob.total_chats) * 100)}%</b>
                </div>
                <div style={{ background: '#dbeafe', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                  <div style={{
                    background: '#2196f3', height: 10, borderRadius: 6,
                    width: `${Math.round((activeJob.logged_count / activeJob.total_chats) * 100)}%`,
                    transition: 'width 0.5s',
                  }} />
                </div>
              </>
            )}
            {activeJob.current_chat && (
              <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>
                🔍 {activeJob.current_chat}
              </div>
            )}
          </div>
        ) : (
          <div style={{
            background: '#f0fdf4', border: '1px solid #86efac',
            borderRadius: 10, padding: '10px 16px', marginBottom: 20,
            fontSize: 13, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 18 }}>✅</span>
            <span>ไม่มี job กำลังทำงาน</span>
            {scheduleOn && <span style={{ marginLeft: 'auto', color: '#555' }}>รันครั้งหน้าใน <b style={{ fontFamily: 'monospace' }}>{fmtCountdown(countdown)}</b></span>}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

          {/* ===== AUTO SCHEDULE ===== */}
          <div className="card" style={{
            border: scheduleOn ? '2px solid #22c55e' : '1px solid #e5e7eb',
            position: 'relative', overflow: 'hidden',
          }}>
            {scheduleOn && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                background: 'linear-gradient(90deg,#22c55e,#16a34a)',
              }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>⏰ Auto-Schedule</h2>
              {scheduleOn && (
                <span style={{ fontSize: 12, background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                  ACTIVE
                </span>
              )}
            </div>

            {scheduleOn ? (
              <div>
                <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
                  สร้าง job อัตโนมัติทุก <b>{cfg.intervalMin} นาที</b>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#888' }}>รันครั้งหน้าใน:</div>
                  <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: countdown < 60000 ? '#ef4444' : '#2196f3' }}>
                    {fmtCountdown(countdown)}
                  </div>
                </div>
                {/* progress bar for countdown */}
                <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, marginBottom: 16 }}>
                  <div style={{
                    background: '#22c55e', borderRadius: 4, height: 6,
                    width: `${100 - Math.round((countdown / (cfg.intervalMs || 1)) * 100)}%`,
                    transition: 'width 1s linear',
                  }} />
                </div>
                <button onClick={disableSchedule} style={{
                  width: '100%', padding: '8px', background: '#fef2f2', color: '#ef4444',
                  border: '1px solid #fca5a5', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
                }}>
                  ⏹ ปิด Auto-Schedule
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                  เปิดให้ scraper สร้าง job อัตโนมัติโดยไม่ต้องกดเอง<br />
                  <span style={{ fontSize: 12, color: '#999' }}>ทำงานตลอดที่แอปเปิดอยู่</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <label style={{ fontSize: 13, color: '#555', whiteSpace: 'nowrap' }}>ทำงานทุก</label>
                  <select value={intervalMin} onChange={e => setIntervalMin(Number(e.target.value))}
                    style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6 }}>
                    {[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} นาที</option>)}
                  </select>
                </div>
                <button onClick={enableSchedule} style={{
                  width: '100%', padding: '10px', background: '#22c55e', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14,
                }}>
                  ▶ เปิด Auto-Schedule
                </button>
              </div>
            )}
          </div>

          {/* ===== MANUAL JOB ===== */}
          <div className="card">
            <h2>▶ Scrape ทันที</h2>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>ADMIN_API_KEY</label>
              <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="key..."
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>จาก</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  style={{ width: '100%', padding: '7px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>ถึง</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  style={{ width: '100%', padding: '7px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
            </div>
            <button onClick={startJob} disabled={loading || !!activeJob} style={{
              width: '100%', padding: '10px', fontWeight: 700,
              opacity: (loading || activeJob) ? 0.5 : 1, cursor: (loading || activeJob) ? 'not-allowed' : 'pointer',
            }}>
              {loading ? '...' : activeJob ? 'มี job อยู่แล้ว' : '▶ เริ่ม Scrape'}
            </button>
            {msg && (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6, fontSize: 12,
                background: msg.startsWith('✅') ? '#f0fdf4' : msg.startsWith('⏹') ? '#f8fafc' : '#fef2f2',
                color: msg.startsWith('✅') ? '#16a34a' : msg.startsWith('⏹') ? '#555' : '#dc2626',
              }}>{msg}</div>
            )}
          </div>
        </div>

        {/* ===== JOB HISTORY ===== */}
        <div className="card">
          <h2>ประวัติ Jobs</h2>
          {jobs.length === 0
            ? <div style={{ color: '#999', padding: '16px 0' }}>ยังไม่มี job</div>
            : (
              <table className="table">
                <thead>
                  <tr>
                    <th>เวลา</th><th>ช่วงวันที่</th><th>สถานะ</th>
                    <th>Chat</th><th>บันทึก</th><th>ใช้เวลา</th><th>หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(j => {
                    const sec = j.started_at && j.finished_at
                      ? Math.round((new Date(j.finished_at) - new Date(j.started_at)) / 1000)
                      : null;
                    return (
                      <tr key={j.id}>
                        <td style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>
                          {new Date(j.created_at).toLocaleString('th-TH')}
                        </td>
                        <td style={{ fontSize: 12 }}>{j.date_from} — {j.date_to}</td>
                        <td>
                          <span style={{ color: statusColor(j.status), fontWeight: 600, fontSize: 12 }}>
                            {statusLabel(j.status)}
                          </span>
                        </td>
                        <td>{j.total_chats || '—'}</td>
                        <td style={{ fontWeight: j.logged_count > 0 ? 600 : 400, color: j.logged_count > 0 ? '#16a34a' : '#999' }}>
                          {j.logged_count || '—'}
                        </td>
                        <td style={{ fontSize: 12 }}>{sec !== null ? `${sec}s` : j.started_at ? '...' : '—'}</td>
                        <td style={{ fontSize: 12, color: '#ef4444', maxWidth: 160 }}>{j.error_text || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          }
        </div>

        {/* ===== INSTRUCTIONS ===== */}
        <div className="card" style={{ marginTop: 16, background: '#f8fafc', fontSize: 13 }}>
          <h2>วิธีเปิด Scraper บนเครื่อง</h2>
          <div style={{ fontFamily: 'monospace', lineHeight: 2.2 }}>
            <div style={{ color: '#888' }}># poll งาน (รอรับ job จากเว็บ)</div>
            <div>node scraper.js --watch</div>
            <div style={{ marginTop: 6, color: '#888' }}># หรือรันพร้อม schedule อัตโนมัติ ไม่ต้องเปิดเบราว์เซอร์</div>
            <div>node scraper.js --watch --schedule=30</div>
          </div>
        </div>
      </main>
    </div>
  );
}

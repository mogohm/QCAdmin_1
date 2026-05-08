'use client';
import { useEffect, useState, useRef } from 'react';

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

function statusColor(s) {
  return s === 'done' ? '#22c55e' : s === 'running' ? '#2196f3' : s === 'error' ? '#ef4444' : s === 'cancelled' ? '#9ca3af' : '#f59e0b';
}
function statusLabel(s) {
  return { pending: '⏳ รอ scraper รับงาน', running: '🔄 กำลังดึงข้อมูล...', done: '✅ เสร็จแล้ว', error: '❌ เกิดข้อผิดพลาด', cancelled: '🚫 ยกเลิกแล้ว' }[s] || s;
}
function fmtCountdown(sec) {
  if (sec <= 0) return '0:00';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export default function ScraperPage() {
  const [key, setKey] = useState(() => typeof localStorage !== 'undefined' ? localStorage.getItem('qc_api_key') || '' : '');
  const [dateFrom, setDateFrom] = useState(yesterday());
  const [dateTo, setDateTo] = useState(today());
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Schedule state
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleMin, setScheduleMin] = useState(30);
  const [countdown, setCountdown] = useState(0);
  const scheduleRef = useRef(null);
  const countdownRef = useRef(null);
  const pollRef = useRef(null);

  const loadJobs = async () => {
    try {
      const r = await fetch('/api/scraper/job');
      const data = await r.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch (_) {}
  };

  useEffect(() => {
    loadJobs();
    pollRef.current = setInterval(loadJobs, 3000);
    return () => clearInterval(pollRef.current);
  }, []);

  // save key to localStorage
  useEffect(() => {
    if (key) localStorage.setItem('qc_api_key', key);
  }, [key]);

  async function submitJob(from, to) {
    if (!key) { setMsg('ใส่ ADMIN_API_KEY ก่อน'); return false; }
    try {
      const r = await fetch('/api/scraper/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ date_from: from, date_to: to }),
      });
      const d = await r.json();
      if (d.ok) { loadJobs(); return true; }
      setMsg('❌ ' + d.error);
      return false;
    } catch (e) { setMsg('❌ ' + e.message); return false; }
  }

  async function startJob() {
    setLoading(true); setMsg('');
    const ok = await submitJob(dateFrom, dateTo);
    if (ok) setMsg('✅ สร้าง job แล้ว — รอ scraper รับงาน');
    setLoading(false);
  }

  function startSchedule() {
    if (!key) { setMsg('ใส่ ADMIN_API_KEY ก่อน'); return; }
    setScheduleOn(true);
    setMsg('');
    const intervalSec = scheduleMin * 60;
    setCountdown(intervalSec);

    // สร้าง job ทันที
    submitJob(today(), today()).then(ok => {
      if (ok) setMsg(`✅ สร้าง job แล้ว — จะทำอีกใน ${scheduleMin} นาที`);
    });

    // countdown tick
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return intervalSec; // reset
        return prev - 1;
      });
    }, 1000);

    // auto-create job ทุก XX นาที
    scheduleRef.current = setInterval(() => {
      submitJob(today(), today()).then(ok => {
        if (ok) setMsg(`🔄 Auto-job: ${new Date().toLocaleTimeString('th-TH')}`);
      });
    }, intervalSec * 1000);
  }

  function stopSchedule() {
    setScheduleOn(false);
    setCountdown(0);
    clearInterval(scheduleRef.current);
    clearInterval(countdownRef.current);
    setMsg('⏹️ หยุด schedule แล้ว');
  }

  useEffect(() => {
    return () => {
      clearInterval(scheduleRef.current);
      clearInterval(countdownRef.current);
    };
  }, []);

  const activeJob = jobs.find(j => j.status === 'running' || j.status === 'pending');

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">QC<span>Admin</span></div>
        <nav className="nav">
          <a href="/">Dashboard</a>
          <a href="/admin">Admin Console</a>
          <a className="active" href="/scraper">Scraper</a>
          <a href="/docs">Setup Docs</a>
        </nav>
      </aside>

      <main className="main">
        <h1>Scraper Control</h1>
        <p className="muted">
          ดึงข้อความที่แอดมินตอบจาก chat.line.biz เข้าระบบ QC — เฉพาะ chat ที่มีการตอบแล้วเท่านั้น<br />
          ต้องเปิด scraper (<code>node scraper.js --watch</code>) ทิ้งไว้บนเครื่องก่อน
        </p>

        {/* API Key + Create Job */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>สร้าง Scrape Job</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>วันที่เริ่ม</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: 6 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>วันที่สิ้นสุด</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: 6 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>ADMIN_API_KEY</label>
              <input type="password" value={key} onChange={e => setKey(e.target.value)}
                placeholder="key..."
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: 6 }} />
            </div>
          </div>
          <button onClick={startJob} disabled={loading || !!activeJob}
            style={{ padding: '8px 24px', opacity: (loading || activeJob) ? 0.6 : 1 }}>
            {loading ? '...' : activeJob ? 'มี job อยู่แล้ว' : '▶ เริ่ม Scrape ทันที'}
          </button>
          {msg && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, fontSize: 13,
              background: msg.startsWith('✅') || msg.startsWith('🔄') ? '#f0fdf4' : msg.startsWith('⏹️') ? '#f8fafc' : '#fef2f2',
              color: msg.startsWith('✅') || msg.startsWith('🔄') ? '#16a34a' : msg.startsWith('⏹️') ? '#555' : '#dc2626' }}>
              {msg}
            </div>
          )}
        </div>

        {/* Schedule */}
        <div className="card" style={{ marginBottom: 16, border: scheduleOn ? '2px solid #22c55e' : '1px solid #e5e7eb' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            ⏰ ตั้งเวลา Auto-Scrape
            {scheduleOn && (
              <span style={{ fontSize: 13, fontWeight: 400, color: '#22c55e', background: '#f0fdf4', padding: '2px 10px', borderRadius: 20 }}>
                กำลังทำงาน
              </span>
            )}
          </h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            สร้าง job อัตโนมัติทุก XX นาที โดยใช้วันที่วันนี้ — ต้องเปิดหน้านี้ค้างไว้
          </p>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, color: '#555' }}>ทุก</label>
              <select
                value={scheduleMin}
                onChange={e => setScheduleMin(Number(e.target.value))}
                disabled={scheduleOn}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                {[15, 30, 60, 90, 120].map(m => (
                  <option key={m} value={m}>{m} นาที</option>
                ))}
              </select>
              <label style={{ fontSize: 13, color: '#555' }}>ครั้ง</label>
            </div>

            {!scheduleOn ? (
              <button onClick={startSchedule}
                style={{ padding: '8px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                ▶ เปิดใช้งาน
              </button>
            ) : (
              <>
                <button onClick={stopSchedule}
                  style={{ padding: '8px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                  ⏹ หยุด
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 13, color: '#666' }}>รันครั้งหน้าใน:</div>
                  <div style={{
                    fontSize: 22, fontWeight: 700, fontFamily: 'monospace',
                    color: countdown <= 60 ? '#ef4444' : '#2196f3',
                    minWidth: 60, textAlign: 'center',
                  }}>
                    {fmtCountdown(countdown)}
                  </div>
                  <div style={{ fontSize: 13, color: '#888' }}>นาที:วินาที</div>
                </div>
              </>
            )}
          </div>
          {scheduleOn && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#888', background: '#f8fafc', padding: '8px 12px', borderRadius: 6 }}>
              💡 ทำงานเฉพาะขณะที่หน้านี้เปิดอยู่ — หากต้องการให้ทำงานอัตโนมัติโดยไม่ต้องเปิดเบราว์เซอร์ ให้รัน:<br />
              <code style={{ background: '#e5e7eb', padding: '2px 6px', borderRadius: 4 }}>node scraper.js --watch --schedule={scheduleMin}</code>
            </div>
          )}
        </div>

        {/* Active Job Status */}
        {activeJob && (
          <div style={{
            background: '#eff6ff', border: '2px solid #2196f3', borderRadius: 12,
            padding: 20, marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, color: '#1d4ed8' }}>กำลังทำงาน</h2>
              <span style={{ fontSize: 13, color: '#666' }}>
                {activeJob.date_from} → {activeJob.date_to}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: statusColor(activeJob.status), marginBottom: 8 }}>
              {statusLabel(activeJob.status)}
            </div>
            {activeJob.total_chats > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span>บันทึกแล้ว {activeJob.logged_count} / {activeJob.total_chats} chats</span>
                  <span>{Math.round((activeJob.logged_count / activeJob.total_chats) * 100)}%</span>
                </div>
                <div style={{ background: '#dbeafe', borderRadius: 4, height: 8 }}>
                  <div style={{
                    background: '#2196f3', borderRadius: 4, height: 8,
                    width: `${Math.round((activeJob.logged_count / activeJob.total_chats) * 100)}%`,
                    transition: 'width 0.5s',
                  }} />
                </div>
              </div>
            )}
            {activeJob.current_chat && (
              <div style={{ fontSize: 12, color: '#666' }}>
                กำลังดึง: {activeJob.current_chat}
              </div>
            )}
          </div>
        )}

        {/* Job History */}
        <div className="card">
          <h2>ประวัติ Jobs</h2>
          {jobs.length === 0
            ? <div style={{ color: '#999' }}>ยังไม่มี job</div>
            : (
              <table className="table">
                <thead>
                  <tr>
                    <th>วันที่สร้าง</th>
                    <th>ช่วงวันที่</th>
                    <th>สถานะ</th>
                    <th>Chat</th>
                    <th>บันทึก</th>
                    <th>ใช้เวลา</th>
                    <th>หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(j => {
                    const duration = j.started_at && j.finished_at
                      ? Math.round((new Date(j.finished_at) - new Date(j.started_at)) / 1000) + 's'
                      : j.started_at ? 'กำลังทำงาน...' : '—';
                    return (
                      <tr key={j.id}>
                        <td style={{ fontSize: 12, color: '#888' }}>{new Date(j.created_at).toLocaleString('th-TH')}</td>
                        <td style={{ fontSize: 12 }}>{j.date_from} — {j.date_to}</td>
                        <td><span style={{ color: statusColor(j.status), fontWeight: 600 }}>{statusLabel(j.status)}</span></td>
                        <td>{j.total_chats || '—'}</td>
                        <td>{j.logged_count || '—'}</td>
                        <td style={{ fontSize: 12 }}>{duration}</td>
                        <td style={{ fontSize: 12, color: '#ef4444' }}>{j.error_text || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          }
        </div>

        {/* Instructions */}
        <div className="card" style={{ marginTop: 16, background: '#f8fafc', fontSize: 13 }}>
          <h2>วิธีเปิด Scraper</h2>
          <div style={{ fontFamily: 'monospace', lineHeight: 2.2 }}>
            <div style={{ color: '#888' }}># poll งาน (รอรับ job จากเว็บ)</div>
            <div>node scraper.js --watch</div>
            <div style={{ marginTop: 6, color: '#888' }}># poll + สร้าง job อัตโนมัติทุก 30 นาที (ไม่ต้องเปิดเบราว์เซอร์)</div>
            <div>node scraper.js --watch --schedule=30</div>
            <div style={{ marginTop: 6, color: '#888' }}># ตั้งค่าใน .env แทน arg</div>
            <div style={{ color: '#888' }}>SCHEDULE_MINUTES=30</div>
          </div>
        </div>
      </main>
    </div>
  );
}

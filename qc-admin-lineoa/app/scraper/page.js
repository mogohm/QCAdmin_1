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

export default function ScraperPage() {
  const [key, setKey] = useState('');
  const [dateFrom, setDateFrom] = useState(yesterday());
  const [dateTo, setDateTo] = useState(today());
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const pollRef = useRef(null);

  const loadJobs = async () => {
    try {
      const r = await fetch('/api/scraper/job');
      setJobs(await r.json());
    } catch (_) {}
  };

  useEffect(() => {
    loadJobs();
    pollRef.current = setInterval(loadJobs, 3000);
    return () => clearInterval(pollRef.current);
  }, []);

  async function startJob() {
    if (!key) { setMsg('ใส่ ADMIN_API_KEY ก่อน'); return; }
    setLoading(true); setMsg('');
    try {
      const r = await fetch('/api/scraper/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      });
      const d = await r.json();
      if (d.ok) { setMsg('✅ สร้าง job แล้ว — รอ scraper รับงาน'); loadJobs(); }
      else setMsg('❌ ' + d.error);
    } catch (e) { setMsg('❌ ' + e.message); }
    setLoading(false);
  }

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
          ต้องเปิด scraper (node scraper.js --watch) ทิ้งไว้บนเครื่องก่อน
        </p>

        {/* Create Job */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>สร้าง Scrape Job</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
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
            <button onClick={startJob} disabled={loading || !!activeJob}
              style={{ padding: '8px 20px', whiteSpace: 'nowrap', opacity: (loading || activeJob) ? 0.6 : 1 }}>
              {loading ? '...' : activeJob ? 'มี job อยู่แล้ว' : '▶ เริ่ม Scrape'}
            </button>
          </div>
          {msg && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, fontSize: 13,
              background: msg.startsWith('✅') ? '#f0fdf4' : '#fef2f2',
              color: msg.startsWith('✅') ? '#16a34a' : '#dc2626' }}>
              {msg}
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
                    <th>Chat ทั้งหมด</th>
                    <th>บันทึกแล้ว</th>
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
          <div style={{ fontFamily: 'monospace', lineHeight: 2 }}>
            <div style={{ color: '#888' }}># เปิด terminal ที่เครื่อง แล้วรัน</div>
            <div>cd h:\QCAdminPJ\qc-scraper</div>
            <div>node scraper.js --watch</div>
            <div style={{ marginTop: 8, color: '#888' }}># scraper จะ poll งานทุก 10 วินาที</div>
            <div style={{ color: '#888' }}># เมื่อกด "เริ่ม Scrape" ด้านบน จะรับงานทันที</div>
          </div>
        </div>
      </main>
    </div>
  );
}

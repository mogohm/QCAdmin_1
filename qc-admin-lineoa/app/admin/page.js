'use client';
import { useEffect, useState } from 'react';

export default function Admin() {
  const [d, setD] = useState(null);
  const [key, setKey] = useState('');
  const [adminId, setAdminId] = useState('');
  const [conv, setConv] = useState('');
  const [text, setText] = useState('');
  const [importText, setImportText] = useState('');
  const [result, setResult] = useState('');
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const load = () =>
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(setD)
      .catch(e => console.error('dashboard load error', e));

  useEffect(() => { load(); }, []);

  async function send() {
    try {
      const r = await fetch('/api/admin/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ conversation_id: conv, admin_id: adminId, text }),
      });
      const data = await r.json();
      setResult(JSON.stringify(data, null, 2));
      if (data.ok) load();
    } catch (e) { setResult(String(e)); }
  }

  async function imp() {
    try {
      const r = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ text: importText }),
      });
      const data = await r.json();
      setResult(JSON.stringify(data, null, 2));
      if (data.ok) load();
    } catch (e) { setResult(String(e)); }
  }

  async function checkHealth() {
    setHealthLoading(true);
    setHealth(null);
    try {
      const r = await fetch('/api/health');
      const data = await r.json();
      setHealth(data);
    } catch (e) {
      setHealth({ error: String(e) });
    } finally {
      setHealthLoading(false);
    }
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">QC<span>Admin</span></div>
        <nav className="nav">
          <a href="/">Dashboard</a>
          <a className="active" href="/admin">Admin Console</a>
          <a href="/docs">Setup Docs</a>
        </nav>
      </aside>
      <main className="main">
        <h1>Admin Console</h1>
        <p className="muted">ใช้หน้านี้ตอบลูกค้าผ่าน LINE Push API เพื่อให้ระบบวัด SLA และ QC ได้ครบ ถ้าไปตอบใน LINE OA Manager โดยตรง LINE ไม่ส่งข้อความแอดมินกลับมาที่ webhook — ตรงนี้แหละกับดักตัวใหญ่</p>

        {/* Health Check Section */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>0) ตรวจสอบสถานะระบบ</h2>
            <button onClick={checkHealth} disabled={healthLoading} style={{ padding: '6px 16px' }}>
              {healthLoading ? 'กำลังตรวจสอบ...' : '🔍 เช็คระบบ'}
            </button>
          </div>

          {health && (
            <div style={{ fontFamily: 'monospace', fontSize: 13 }}>
              <div style={{ marginBottom: 8 }}>
                <b>สถานะ:</b> {health.status} &nbsp;|&nbsp; <b>เวลา:</b> {health.timestamp}
              </div>

              {/* ENV VARS */}
              <div style={{ marginBottom: 8 }}>
                <b>Environment Variables:</b>
                <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
                  <tbody>
                    {health.env && Object.entries(health.env).map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ padding: '2px 12px 2px 0', color: '#666', whiteSpace: 'nowrap' }}>{k}</td>
                        <td style={{ padding: '2px 0' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* DATABASE */}
              <div style={{ marginBottom: 8 }}>
                <b>Database:</b> {health.database?.status}
                {health.database?.error && (
                  <div style={{ color: 'red', marginTop: 4 }}>Error: {health.database.error}</div>
                )}
                {health.database?.tables && (
                  <table style={{ borderCollapse: 'collapse', marginTop: 4 }}>
                    <tbody>
                      {Object.entries(health.database.tables).map(([t, c]) => (
                        <tr key={t}>
                          <td style={{ padding: '2px 12px 2px 0', color: '#666' }}>{t}</td>
                          <td style={{ padding: '2px 0' }}>{c} rows</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* LINE */}
              <div style={{ marginBottom: 8 }}>
                <b>LINE Token:</b> {health.line?.token}
              </div>

              {/* RECENT MESSAGES */}
              {health.recentMessages?.length > 0 && (
                <div>
                  <b>ข้อความล่าสุด {health.recentMessages.length} รายการ:</b>
                  <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
                    <thead>
                      <tr style={{ color: '#666' }}>
                        <th style={{ textAlign: 'left', padding: '2px 8px 2px 0', fontWeight: 'normal' }}>เวลา</th>
                        <th style={{ textAlign: 'left', padding: '2px 8px 2px 0', fontWeight: 'normal' }}>ชื่อ</th>
                        <th style={{ textAlign: 'left', padding: '2px 8px 2px 0', fontWeight: 'normal' }}>ทิศทาง</th>
                        <th style={{ textAlign: 'left', padding: '2px 0', fontWeight: 'normal' }}>ข้อความ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.recentMessages.map((m, i) => (
                        <tr key={i}>
                          <td style={{ padding: '2px 8px 2px 0', whiteSpace: 'nowrap' }}>
                            {new Date(m.created_at).toLocaleString('th-TH')}
                          </td>
                          <td style={{ padding: '2px 8px 2px 0' }}>{m.display_name || m.line_user_id}</td>
                          <td style={{ padding: '2px 8px 2px 0', color: m.direction === 'customer' ? '#2196f3' : '#4caf50' }}>
                            {m.direction === 'customer' ? '👤 ลูกค้า' : '🛡 แอดมิน'}
                          </td>
                          <td style={{ padding: '2px 0' }}>{m.message_text?.slice(0, 60)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {health.recentMessages?.length === 0 && (
                <div style={{ color: '#f59e0b' }}>⚠️ ยังไม่มีข้อความใน database เลย — เช็ค webhook URL ที่ LINE Developers</div>
              )}
            </div>
          )}
        </div>

        <div className="cols">
          <div className="card">
            <h2>1) Import Admin จาก Manage permissions</h2>
            <p className="muted">คัดลอกชื่อ Member จาก LINE OA Manage permissions มาวาง ระบบจะเก็บเฉพาะชื่อขึ้นต้น PK แม้มี emoji ปน</p>
            <input placeholder="ADMIN_API_KEY" value={key} onChange={e => setKey(e.target.value)} />
            <textarea rows="8" placeholder={'PK Golf 🚀\nPK May 🌟\nCS John'} value={importText} onChange={e => setImportText(e.target.value)} />
            <button onClick={imp}>Import PK Admin</button>
          </div>
          <div className="card">
            <h2>2) Reply Customer</h2>
            <select value={adminId} onChange={e => setAdminId(e.target.value)}>
              <option value="">เลือก Admin</option>
              {(d?.ranking || []).map(a => <option key={a.id} value={a.id}>{a.member_name}</option>)}
            </select>
            <select value={conv} onChange={e => setConv(e.target.value)}>
              <option value="">เลือก Case</option>
              {(d?.openCases || []).map(c => <option key={c.id} value={c.id}>{(c.display_name || c.line_user_id) + ' | ' + c.message_text?.slice(0, 40)}</option>)}
            </select>
            <textarea rows="8" placeholder="ข้อความตอบลูกค้า" value={text} onChange={e => setText(e.target.value)} />
            <button onClick={send}>Send + QC Score</button>
          </div>
        </div>

        <pre className="card" style={{ whiteSpace: 'pre-wrap', marginTop: 16 }}>{result}</pre>
      </main>
    </div>
  );
}

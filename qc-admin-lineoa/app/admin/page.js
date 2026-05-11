'use client';
import { useEffect, useState } from 'react';

export default function Admin() {
  const [d, setD] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [key, setKey] = useState('');
  const [adminId, setAdminId] = useState('');
  const [conv, setConv] = useState('');
  const [text, setText] = useState('');
  const [sendLine, setSendLine] = useState(true);
  const [importText, setImportText] = useState('');
  const [result, setResult] = useState('');
  const [resultOk, setResultOk] = useState(null);
  const [sending, setSending] = useState(false);
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const load = () =>
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(setD)
      .catch(e => console.error('dashboard load error', e));

  const loadAdmins = () =>
    fetch('/api/admin/list')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAdmins(data); })
      .catch(() => {});

  useEffect(() => { load(); loadAdmins(); }, []);

  async function send() {
    if (!adminId || !conv || !text.trim()) {
      setResult('กรุณาเลือก Admin, Case และกรอกข้อความ'); setResultOk(false); return;
    }
    setSending(true);
    try {
      const r = await fetch('/api/admin/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ conversation_id: conv, admin_id: adminId, text, send_line: sendLine }),
      });
      const data = await r.json();
      setResultOk(data.ok);
      if (data.ok) {
        const mode = sendLine ? '✅ ส่งหาลูกค้าแล้ว + บันทึก QC' : '✅ บันทึก QC แล้ว (ไม่ได้ส่งซ้ำ)';
        setResult(mode + '\n\nQC Score:\n' + JSON.stringify(data.qc, null, 2));
        setText('');
        load();
      } else {
        setResult('❌ ' + JSON.stringify(data, null, 2));
      }
    } catch (e) { setResult('❌ ' + String(e)); setResultOk(false); }
    setSending(false);
  }

  async function imp() {
    try {
      const r = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ text: importText }),
      });
      const data = await r.json();
      setResultOk(data.ok);
      setResult(JSON.stringify(data, null, 2));
      if (data.ok) { load(); loadAdmins(); }
    } catch (e) { setResult(String(e)); setResultOk(false); }
  }

  async function checkHealth() {
    setHealthLoading(true); setHealth(null);
    try {
      const r = await fetch('/api/health');
      setHealth(await r.json());
    } catch (e) { setHealth({ error: String(e) }); }
    setHealthLoading(false);
  }

  const adminList = admins.length > 0 ? admins : (d?.ranking || []);
  const openCases = d?.openCases || [];

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">QC<span>Admin</span></div>
        <nav className="nav">
          <a href="/">Dashboard</a>
          <a className="active" href="/admin">Admin Console</a>
          <a href="/scraper">Scraper</a>
          <a href="/docs">Setup Docs</a>
          <a href="/PROJECT_DOCS.html" target="_blank">📄 Project Docs</a>
        </nav>
      </aside>
      <main className="main">
        <h1>Admin Console</h1>
        <p className="muted">
          ระบบนี้บันทึก + วัด QC การตอบแอดมิน — LINE ไม่ส่ง webhook กลับเมื่อตอบใน OA Manager โดยตรง
          ใช้ได้ 2 โหมด: <b>ส่งผ่านระบบ</b> (ส่ง LINE + บันทึก) หรือ <b>บันทึกย้อนหลัง</b> (ตอบใน OA ไปแล้ว มาบันทึก QC)
        </p>

        {/* Health Check */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>0) ตรวจสอบสถานะระบบ</h2>
            <button onClick={checkHealth} disabled={healthLoading} style={{ padding: '6px 16px' }}>
              {healthLoading ? 'กำลังตรวจสอบ...' : '🔍 เช็คระบบ'}
            </button>
          </div>
          {health && <HealthPanel health={health} />}
        </div>

        <div className="cols">
          {/* Import Admins */}
          <div className="card">
            <h2>1) Import Admin จาก Manage permissions</h2>
            <p className="muted">คัดลอกชื่อ Member จาก LINE OA Manage permissions มาวาง ระบบเก็บเฉพาะชื่อขึ้นต้น PK</p>
            <input placeholder="ADMIN_API_KEY" value={key} onChange={e => setKey(e.target.value)} />
            <textarea rows="6" placeholder={'PK Golf 🚀\nPK May 🌟\nCS John'} value={importText} onChange={e => setImportText(e.target.value)} />
            <button onClick={imp}>Import PK Admin</button>
            {admins.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#22c55e' }}>
                ✅ Admin ในระบบ: {admins.map(a => a.member_name).join(', ')}
              </div>
            )}
          </div>

          {/* Reply */}
          <div className="card">
            <h2>2) บันทึก / ตอบลูกค้า</h2>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
              <button
                onClick={() => setSendLine(true)}
                style={{
                  flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
                  background: sendLine ? '#2196f3' : '#f8fafc',
                  color: sendLine ? '#fff' : '#666',
                  fontWeight: sendLine ? 700 : 400,
                }}
              >
                📤 ส่ง LINE + บันทึก QC
              </button>
              <button
                onClick={() => setSendLine(false)}
                style={{
                  flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
                  background: !sendLine ? '#f59e0b' : '#f8fafc',
                  color: !sendLine ? '#fff' : '#666',
                  fontWeight: !sendLine ? 700 : 400,
                }}
              >
                📋 บันทึกย้อนหลัง
              </button>
            </div>

            {!sendLine && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 10, color: '#92400e' }}>
                โหมดนี้: บันทึก QC อย่างเดียว <b>ไม่ส่งข้อความซ้ำ</b> ใช้เมื่อตอบใน LINE OA Manager ไปแล้ว
              </div>
            )}

            <select value={adminId} onChange={e => setAdminId(e.target.value)}>
              <option value="">เลือก Admin ({adminList.length} คน)</option>
              {adminList.map(a => <option key={a.id} value={a.id}>{a.member_name}</option>)}
            </select>

            <select value={conv} onChange={e => setConv(e.target.value)}>
              <option value="">เลือก Case ({openCases.length} open)</option>
              {openCases.map(c => (
                <option key={c.id} value={c.id}>
                  {(c.display_name || c.line_user_id) + ' — ' + (c.message_text?.slice(0, 40) || '(ไม่มีข้อความ)')}
                </option>
              ))}
            </select>

            {openCases.length === 0 && (
              <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 8 }}>
                ⚠️ ไม่มี open case — รอลูกค้าส่งข้อความมาก่อน
              </div>
            )}

            <textarea
              rows="5"
              placeholder={sendLine ? 'พิมพ์ข้อความที่จะส่งหาลูกค้า...' : 'พิมพ์ข้อความที่ตอบไปแล้ว (เพื่อบันทึก QC)...'}
              value={text}
              onChange={e => setText(e.target.value)}
            />

            <button onClick={send} disabled={sending} style={{ background: sendLine ? undefined : '#f59e0b' }}>
              {sending ? 'กำลังดำเนินการ...' : sendLine ? '📤 Send + QC Score' : '📋 บันทึก QC'}
            </button>
          </div>
        </div>

        {/* Result */}
        {result && (
          <pre className="card" style={{
            whiteSpace: 'pre-wrap', marginTop: 16,
            borderLeft: `4px solid ${resultOk ? '#22c55e' : '#ef4444'}`,
            background: resultOk ? '#f0fdf4' : '#fef2f2',
          }}>
            {result}
          </pre>
        )}
      </main>
    </div>
  );
}

function HealthPanel({ health }) {
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 13 }}>
      <div style={{ marginBottom: 8 }}>
        <b>สถานะ:</b> {health.status} &nbsp;|&nbsp; <b>เวลา:</b> {health.timestamp}
      </div>
      <div style={{ marginBottom: 8 }}>
        <b>Environment Variables:</b>
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
          <tbody>
            {health.env && Object.entries(health.env).map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: '2px 12px 2px 0', color: '#666', whiteSpace: 'nowrap' }}>{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginBottom: 8 }}>
        <b>Database:</b> {health.database?.status}
        {health.database?.error && <div style={{ color: 'red' }}>Error: {health.database.error}</div>}
        {health.database?.tables && (
          <table style={{ borderCollapse: 'collapse', marginTop: 4 }}>
            <tbody>
              {Object.entries(health.database.tables).map(([t, c]) => (
                <tr key={t}>
                  <td style={{ padding: '2px 12px 2px 0', color: '#666' }}>{t}</td>
                  <td>{c} rows</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ marginBottom: 8 }}><b>LINE Token:</b> {health.line?.token}</div>
      {health.recentMessages?.length > 0 && (
        <div>
          <b>ข้อความล่าสุด:</b>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
            <tbody>
              {health.recentMessages.map((m, i) => (
                <tr key={i}>
                  <td style={{ padding: '2px 8px 2px 0', fontSize: 11, color: '#888' }}>{new Date(m.created_at).toLocaleString('th-TH')}</td>
                  <td style={{ padding: '2px 8px 2px 0' }}>{m.display_name || m.line_user_id}</td>
                  <td style={{ padding: '2px 8px 2px 0', color: m.direction === 'customer' ? '#2196f3' : '#4caf50' }}>
                    {m.direction === 'customer' ? '👤' : '🛡'}
                  </td>
                  <td style={{ fontSize: 12 }}>{m.message_text?.slice(0, 60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {health.recentMessages?.length === 0 && (
        <div style={{ color: '#f59e0b' }}>⚠️ ยังไม่มีข้อความใน database — เช็ค webhook URL ที่ LINE Developers</div>
      )}
    </div>
  );
}

'use client';
import { useEffect, useState, useRef } from 'react';

function fmtSec(s) {
  s = Number(s || 0);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function scoreClass(v) { return v >= 85 ? 'good' : v >= 70 ? 'warn' : 'bad'; }
function scoreLabel(v) { return v >= 85 ? '✅ ดี' : v >= 70 ? '⚠️ พอใช้' : '❌ ต่ำ'; }
function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return `${diff} วินาทีที่แล้ว`;
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  return new Date(iso).toLocaleString('th-TH');
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [now, setNow] = useState(new Date());
  const [lastFetch, setLastFetch] = useState(null);
  const [fetchOk, setFetchOk] = useState(null);
  const [pulse, setPulse] = useState(false);
  const [expandAdmin, setExpandAdmin] = useState(null);
  const tickRef = useRef(null);

  const load = () => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(data => {
        setD(data);
        setLastFetch(new Date());
        setFetchOk(!data.error);
        if (data.error) console.error('Dashboard API error:', data.error);
        setPulse(p => !p);
      })
      .catch(e => { setFetchOk(false); console.error('Dashboard fetch failed:', e); });
  };

  useEffect(() => {
    load();
    const api = setInterval(load, 15000);
    tickRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(api); clearInterval(tickRef.current); };
  }, []);

  const k = d?.kpi || {};
  const la = d?.lastActivity || {};

  const systemAlive = fetchOk && lastFetch && (Date.now() - lastFetch) < 30000;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">QC<span>Admin</span></div>
        <nav className="nav">
          <a className="active" href="/">Dashboard</a>
          <a href="/admin">Admin Console</a>
          <a href="/docs">Setup Docs</a>
        </nav>

        {/* Live system status in sidebar */}
        <div style={{ marginTop: 'auto', padding: '16px 0', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: systemAlive ? '#22c55e' : '#ef4444',
              boxShadow: systemAlive ? '0 0 6px #22c55e' : 'none',
              display: 'inline-block',
              animation: systemAlive ? 'blink 2s infinite' : 'none',
            }} />
            <span style={{ color: systemAlive ? '#22c55e' : '#ef4444' }}>
              {systemAlive ? 'System Online' : 'Offline'}
            </span>
          </div>
          <div style={{ color: '#888', lineHeight: 1.8 }}>
            <div>🕐 {now.toLocaleTimeString('th-TH')}</div>
            <div>📡 Refresh ทุก 15s</div>
            {lastFetch && <div>⬆️ อัพเดตล่าสุด {timeAgo(lastFetch)}</div>}
          </div>
        </div>
      </aside>

      <main className="main">
        {/* Header + live clock */}
        <div className="top">
          <div>
            <h1>LINE OA Quality Dashboard</h1>
            <div className="muted">ตรวจความเร็ว ความถูกต้อง น้ำเสียง และคะแนนแอดมินแบบ near real-time</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="badge">Production Ready v1</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 6 }}>
              {now.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'medium' })}
            </div>
          </div>
        </div>

        {/* Error banner */}
        {d?.error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
            padding: '10px 16px', marginBottom: 16, color: '#dc2626', fontSize: 13,
          }}>
            <b>❌ Dashboard API Error:</b> {d.error}
            <div style={{ marginTop: 4, color: '#999', fontSize: 12 }}>
              เช็ค: 1) DATABASE_URL ใน Vercel env vars  2) รัน schema.sql แล้วหรือยัง (init-db)  3) ดูที่ /api/health
            </div>
          </div>
        )}

        {/* Activity pulse bar */}
        <div style={{
          display: 'flex', gap: 16, padding: '10px 16px', background: '#f8fafc',
          borderRadius: 8, marginBottom: 16, fontSize: 13, flexWrap: 'wrap',
        }}>
          <span>
            <b>ข้อความลูกค้าล่าสุด:</b>{' '}
            <span style={{ color: la.last_customer_msg ? '#2196f3' : '#999' }}>
              {la.last_customer_msg ? timeAgo(la.last_customer_msg) : '—'}
            </span>
          </span>
          <span>
            <b>แอดมินตอบล่าสุด:</b>{' '}
            <span style={{ color: la.last_admin_reply ? '#22c55e' : '#999' }}>
              {la.last_admin_reply ? timeAgo(la.last_admin_reply) : '—'}
            </span>
          </span>
          <span>
            <b>ลูกค้าใหม่ล่าสุด:</b>{' '}
            <span style={{ color: la.last_new_customer ? '#f59e0b' : '#999' }}>
              {la.last_new_customer ? timeAgo(la.last_new_customer) : '—'}
            </span>
          </span>
          <span style={{ marginLeft: 'auto', color: '#888' }}>
            Server: {la.server_time ? new Date(la.server_time).toLocaleTimeString('th-TH') : '—'}
          </span>
        </div>

        {/* KPIs */}
        <section className="grid kpis">
          <K title="ลูกค้าแอดไลน์" v={k.customers || 0} />
          <K title="สมัครผ่าน" v={k.registered_pass || 0} />
          <K title="KYC ผ่าน" v={k.kyc_pass || 0} />
          <K title="ยอดเติม" v={Number(k.deposit_total || 0).toLocaleString()} />
          <K title="ตอบเฉลี่ย" v={fmtSec(k.avg_response_sec)} />
          <K title="คะแนนเฉลี่ย" v={k.avg_score || 0} />
        </section>

        <section className="grid split">
          {/* Admin Ranking with breakdown */}
          <div className="card">
            <h2>Ranking Admin</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Admin</th>
                  <th>Cases</th>
                  <th>Score</th>
                  <th>ตอบเฉลี่ย</th>
                  <th>ตอบล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {(d?.ranking || []).map((r, i) => (
                  <>
                    <tr key={r.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandAdmin(expandAdmin === r.id ? null : r.id)}
                    >
                      <td>{i + 1}</td>
                      <td><b>{r.member_name}</b></td>
                      <td>{r.cases}</td>
                      <td className={'score ' + scoreClass(r.avg_score)}>
                        {r.avg_score} {scoreLabel(r.avg_score)}
                      </td>
                      <td>{fmtSec(r.avg_response_sec)}</td>
                      <td style={{ color: '#888', fontSize: 12 }}>{r.last_reply_at ? timeAgo(r.last_reply_at) : '—'}</td>
                    </tr>
                    {expandAdmin === r.id && (
                      <tr key={r.id + '-detail'}>
                        <td colSpan={6} style={{ background: '#f8fafc', padding: '8px 16px', fontSize: 13 }}>
                          <div style={{ display: 'flex', gap: 24 }}>
                            <span>✅ ดี (≥85): <b style={{ color: '#22c55e' }}>{r.good}</b></span>
                            <span>⚠️ พอใช้ (70-84): <b style={{ color: '#f59e0b' }}>{r.warn}</b></span>
                            <span>❌ ต่ำ (&lt;70): <b style={{ color: '#ef4444' }}>{r.bad}</b></span>
                          </div>
                          <div style={{ marginTop: 6 }}>
                            <b>ประวัติการตอบล่าสุด:</b>
                            <div style={{ marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                              {(d?.replyLog || []).filter(x => x.admin_name === r.member_name).slice(0, 10).map((x, j) => (
                                <div key={j} style={{
                                  padding: '6px 0',
                                  borderBottom: '1px solid #e5e7eb',
                                  display: 'grid',
                                  gridTemplateColumns: '120px 1fr 60px',
                                  gap: 8,
                                  alignItems: 'start',
                                }}>
                                  <span style={{ color: '#888', fontSize: 11 }}>{timeAgo(x.created_at)}</span>
                                  <div>
                                    <div style={{ color: '#666', fontSize: 11 }}>
                                      👤 {x.customer_name || x.line_user_id}: {x.customer_text?.slice(0, 50) || '—'}
                                    </div>
                                    <div style={{ fontSize: 12, marginTop: 2 }}>
                                      💬 {x.reply_text?.slice(0, 60)}
                                    </div>
                                    {x.fail_reasons?.length > 0 && (
                                      <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>
                                        ⚠️ {JSON.parse(x.fail_reasons).join(', ')}
                                      </div>
                                    )}
                                  </div>
                                  <span className={'score ' + scoreClass(x.final_score || 0)} style={{ textAlign: 'center' }}>
                                    {x.final_score ?? '—'}
                                  </span>
                                </div>
                              ))}
                              {!(d?.replyLog || []).some(x => x.admin_name === r.member_name) && (
                                <div style={{ color: '#999', fontSize: 12 }}>ยังไม่มีประวัติการตอบ</div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Promotion */}
          <div className="card">
            <h2>Promotion Performance</h2>
            <table className="table">
              <thead><tr><th>Promo</th><th>ลูกค้า</th><th>ยอดเติม</th></tr></thead>
              <tbody>
                {(d?.promos || []).map((p, i) => (
                  <tr key={i}>
                    <td>{p.promotion_code}</td>
                    <td>{p.customer_count}</td>
                    <td>{Number(p.total_amount || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Admin Reply Log */}
        <section className="card" style={{ marginTop: 16 }}>
          <h2>ประวัติการตอบของแอดมิน (50 ล่าสุด)</h2>
          {(d?.replyLog || []).length === 0
            ? <div style={{ color: '#999', padding: '12px 0' }}>ยังไม่มีการตอบผ่านระบบ</div>
            : (
              <table className="table">
                <thead>
                  <tr>
                    <th>เวลา</th>
                    <th>Admin</th>
                    <th>ลูกค้า</th>
                    <th>คำถามลูกค้า</th>
                    <th>คำตอบแอดมิน</th>
                    <th>เวลาตอบ</th>
                    <th>Score</th>
                    <th>ถูกต้อง?</th>
                  </tr>
                </thead>
                <tbody>
                  {(d?.replyLog || []).map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>{timeAgo(r.created_at)}</td>
                      <td><b>{r.admin_name}</b></td>
                      <td style={{ fontSize: 12 }}>{r.customer_name || r.line_user_id}</td>
                      <td style={{ fontSize: 12, color: '#666' }}>{r.customer_text?.slice(0, 40) || '—'}</td>
                      <td style={{ fontSize: 12 }}>{r.reply_text?.slice(0, 40)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.response_seconds != null ? fmtSec(r.response_seconds) : '—'}</td>
                      <td className={'score ' + scoreClass(r.final_score || 0)}>
                        {r.final_score ?? '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {r.final_score == null ? '—'
                          : r.final_score >= 70
                            ? <span style={{ color: '#22c55e' }}>✅ ผ่าน</span>
                            : <span style={{ color: '#ef4444' }}>❌ {tryParseArr(r.fail_reasons).slice(0, 1).join('')}</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </section>

        {/* Open Cases */}
        <section className="card" style={{ marginTop: 16 }}>
          <h2>Open Cases ({(d?.openCases || []).length})</h2>
          {(d?.openCases || []).map(c => (
            <div className="case" key={c.id}>
              <b>{c.display_name || c.line_user_id}</b>
              <div className="muted">{c.id}</div>
              <p>{c.message_text}</p>
            </div>
          ))}
        </section>
      </main>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function K({ title, v }) {
  return (
    <div className="card">
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{v}</div>
    </div>
  );
}

function tryParseArr(v) {
  try { return JSON.parse(v) || []; } catch { return []; }
}

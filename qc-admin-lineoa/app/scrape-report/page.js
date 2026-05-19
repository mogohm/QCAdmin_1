'use client';
import { useEffect, useState } from 'react';

const today     = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

function scoreColor(s) {
  if (s == null) return '#94a3b8';
  if (s >= 85)  return '#22c55e';
  if (s >= 70)  return '#f59e0b';
  return '#ef4444';
}
function fmtTs(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('th-TH'); } catch { return ts; }
}

// ---- Diagram: แผนผัง LINE OA Manager 4 กรอบ ----
function ScrapeDiagram() {
  const box = (label, num, color, x, y, w, h, desc) => (
    <g key={num}>
      <rect x={x} y={y} width={w} height={h} rx={6}
        fill="none" stroke={color} strokeWidth={2.5} strokeDasharray={num === 0 ? 'none' : 'none'} />
      {/* label badge */}
      <rect x={x + 6} y={y - 10} width={22} height={20} rx={4} fill={color} />
      <text x={x + 17} y={y + 4} textAnchor="middle" fill="#fff" fontSize={11} fontWeight="bold">{num}</text>
      {/* description */}
      <text x={x + w / 2} y={y + h + 16} textAnchor="middle" fill={color} fontSize={10} fontWeight="600">{desc}</text>
    </g>
  );

  return (
    <div style={{ background: '#0f172a', borderRadius: 12, padding: 20, marginBottom: 24, overflowX: 'auto' }}>
      <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8, fontFamily: 'monospace' }}>
        ▼ แผนผัง: LINE Official Account Manager — จุดที่ Scraper ดึงข้อมูล
      </div>
      <svg viewBox="0 0 780 260" style={{ width: '100%', maxWidth: 780, display: 'block' }}>
        {/* background mockup */}
        <rect width={780} height={260} rx={8} fill="#1e293b" />

        {/* Sidebar left (LINE menu) */}
        <rect x={4} y={4} width={55} height={252} rx={6} fill="#0a1628" />
        <text x={31} y={28} textAnchor="middle" fill="#3b82f6" fontSize={8} fontWeight="bold">LINE</text>
        <text x={31} y={42} textAnchor="middle" fill="#64748b" fontSize={7}>Chats</text>
        <text x={31} y={54} textAnchor="middle" fill="#64748b" fontSize={7}>Contact</text>
        <text x={31} y={66} textAnchor="middle" fill="#64748b" fontSize={7}>Msg Multi</text>

        {/* Box 1: Chat list */}
        <rect x={62} y={4} width={165} height={252} rx={4} fill="#162032" />
        <rect x={62} y={4} width={165} height={22} rx={4} fill="#1e3a5f" />
        <text x={144} y={18} textAnchor="middle" fill="#93c5fd" fontSize={9}>≡ All   🔍 Search</text>
        {[0, 1, 2, 3, 4, 5, 6].map(i => (
          <g key={i}>
            <circle cx={82} cy={44 + i * 32} r={10} fill="#1e3a5f" />
            <rect x={96} y={36 + i * 32} width={110} height={8} rx={3} fill="#1e3a5f" />
            <rect x={96} y={48 + i * 32} width={80} height={6} rx={3} fill="#0f2440" />
            <text x={163} y={42 + i * 32} fill="#64748b" fontSize={7}>10:2{i}</text>
          </g>
        ))}
        {/* highlight active item */}
        <rect x={64} y={68} width={161} height={30} rx={3} fill="#1d4ed820" stroke="#3b82f6" strokeWidth={1} />

        {/* Box 2: Customer profile (right panel top) */}
        <rect x={590} y={4} width={186} height={80} rx={4} fill="#162032" />
        <circle cx={618} cy={28} r={14} fill="#1e3a5f" />
        <text x={618} y={32} textAnchor="middle" fill="#3b82f6" fontSize={9}>👤</text>
        <text x={640} y={24} fill="#e2e8f0" fontSize={9} fontWeight="bold">838160/0958672075</text>
        <text x={640} y={36} fill="#94a3b8" fontSize={8}>(Nice)</text>
        <text x={593} y={54} fill="#64748b" fontSize={7}>+ Add tags</text>
        <text x={593} y={66} fill="#64748b" fontSize={7}>Assign  🟢 PK - Jane  ✏️</text>

        {/* Box 3: Chat panel (center) */}
        <rect x={230} y={4} width={356} height={212} rx={4} fill="#0f172a" />
        <rect x={230} y={4} width={356} height={20} rx={4} fill="#1e293b" />
        <text x={408} y={16} textAnchor="middle" fill="#94a3b8" fontSize={8}>838160/0958672075  ● Follow up  ✓ Resolve  🔍 Search</text>
        {/* customer msg left */}
        <rect x={238} y={32} width={130} height={28} rx={10} fill="#1e293b" />
        <text x={248} y={48} fill="#e2e8f0" fontSize={8}>ไม่พูดคุยครับ</text>
        {/* customer msg 2 */}
        <rect x={238} y={68} width={150} height={28} rx={10} fill="#1e293b" />
        <text x={248} y={84} fill="#e2e8f0" fontSize={8}>บัตรสำรวจที่ไหนดีครับ</text>
        {/* admin msg right */}
        <rect x={376} y={106} width={200} height={42} rx={10} fill="#1d4ed8" />
        <text x={386} y={122} fill="#fff" fontSize={7.5}>♦ แจ้งยืนยันตรวจสอบแล้ว</text>
        <text x={386} y={133} fill="#bfdbfe" fontSize={7}>ขอบคุณที่ใช้บริการทางการตรวจสอบ</text>
        <text x={386} y={143} fill="#bfdbfe" fontSize={7}>ทำงานทุกวัน 09:00 น.</text>
        <text x={548} y={153} fill="#60a5fa" fontSize={7}>PK - Jane</text>
        {/* labels */}
        <text x={260} y={170} fill="#22c55e" fontSize={8} fontWeight="bold">← ลูกค้า (Left)</text>
        <text x={440} y={170} fill="#3b82f6" fontSize={8} fontWeight="bold">Admin (Right) →</text>
        {/* enter bar */}
        <rect x={230} y={218} width={356} height={22} rx={4} fill="#1e293b" />
        <text x={340} y={231} fill="#64748b" fontSize={7}>Enter: Send message, Shift+Enter: New line</text>
        <rect x={556} y={220} width={26} height={18} rx={4} fill="#22c55e" />
        <text x={569} y={231} textAnchor="middle" fill="#fff" fontSize={8} fontWeight="bold">Send</text>

        {/* Box 4: Notes (right panel bottom) */}
        <rect x={590} y={88} width={186} height={168} rx={4} fill="#162032" />
        <text x={597} y={102} fill="#94a3b8" fontSize={8} fontWeight="bold">Notes 1/1000  +</text>
        <rect x={592} y={107} width={182} height={110} rx={4} fill="#1e293b" />
        <text x={600} y={120} fill="#e2e8f0" fontSize={7.5}>ชื่อ - นามสกุล(ไทย): นายจักร นาคทอง</text>
        <text x={600} y={131} fill="#e2e8f0" fontSize={7.5}>ชื่อ - นามสกุล(Eng): thanawat</text>
        <text x={600} y={142} fill="#e2e8f0" fontSize={7.5}>Nickname: KimberRR</text>
        <text x={600} y={153} fill="#e2e8f0" fontSize={7.5}>สาขา: กลศวิทยา</text>
        <text x={600} y={164} fill="#e2e8f0" fontSize={7.5}>เลขทบัตร: 0443190/16</text>
        <text x={600} y={175} fill="#e2e8f0" fontSize={7.5}>เบอร์โทร: 0958672075</text>
        <text x={600} y={186} fill="#94a3b8" fontSize={7}>5/13/2026, 23:27  PK Fern</text>
        <rect x={592} y={218} width={182} height={18} rx={4} fill="#1e3a5f" />
        <text x={683} y={229} textAnchor="middle" fill="#64748b" fontSize={7}>✏️ แก้ไข   🗑️ ลบ</text>

        {/* Colored boxes overlaid */}
        {box('', '1', '#3b82f6', 62, 4, 165, 252, 'Chat List — กรองวันที่')}
        {box('', '2', '#22c55e', 590, 4, 186, 80, 'ชื่อลูกค้า')}
        {box('', '3', '#f59e0b', 230, 4, 356, 234, 'ข้อความ Q&A + ชื่อ Admin')}
        {box('', '4', '#a855f7', 590, 88, 186, 168, 'Notes + วันที่ + Admin')}
      </svg>
    </div>
  );
}

// ---- Main Page ----
export default function ScrapeReportPage() {
  const [from, setFrom] = useState(yesterday());
  const [to,   setTo]   = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(new Set());

  async function loadReport() {
    setLoading(true);
    try {
      const r = await fetch(`/api/scraper/report?from=${from}&to=${to}`);
      const d = await r.json();
      setData(d);
      setExpanded(new Set());
    } catch (e) {
      setData({ error: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReport(); }, []);

  function toggle(uid) {
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(uid) ? s.delete(uid) : s.add(uid);
      return s;
    });
  }

  const nav = (
    <aside className="side">
      <div className="brand">QC<span>Admin</span></div>
      <nav className="nav">
        <a href="/">Dashboard</a>
        <a href="/admin">Admin Console</a>
        <a href="/scraper">Scraper</a>
        <a href="/rules">⚙️ QC Rules</a>
        <a className="active" href="/scrape-report">📊 Scrape Report</a>
        <a href="/docs">Setup Docs</a>
        <a href="/PROJECT_DOCS.html" target="_blank">📄 Project Docs</a>
      </nav>
    </aside>
  );

  return (
    <div className="shell">
      {nav}
      <main className="main">
        <div className="top">
          <div>
            <h1>📊 Scrape Report</h1>
            <p className="muted">ผลการ Scrape — ข้อความ, คู่ Q&A, ชื่อ Admin และ Notes ของลูกค้า</p>
          </div>
        </div>

        {/* ---- Diagram ---- */}
        <ScrapeDiagram />

        {/* ---- Filter ---- */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>จากวันที่</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>ถึงวันที่</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6 }} />
            </div>
            <button onClick={loadReport} disabled={loading}
              style={{ padding: '8px 20px', fontWeight: 700, opacity: loading ? 0.5 : 1 }}>
              {loading ? '⏳ โหลด...' : '🔍 ดูรายงาน'}
            </button>
          </div>
        </div>

        {data?.error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 16, color: '#dc2626', marginBottom: 16 }}>
            ❌ {data.error}
          </div>
        )}

        {data && !data.error && (
          <>
            {/* ---- Summary ---- */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Jobs', v: data.jobs?.length ?? 0, icon: '🔄', c: '#3b82f6' },
                { label: 'Customers', v: data.total_customers, icon: '👤', c: '#22c55e' },
                { label: 'Messages', v: data.total_messages, icon: '💬', c: '#f59e0b' },
                { label: 'Notes', v: data.total_notes, icon: '📝', c: '#a855f7' },
              ].map(({ label, v, icon, c }) => (
                <div key={label} className="card" style={{ textAlign: 'center', borderTop: `3px solid ${c}` }}>
                  <div style={{ fontSize: 22 }}>{icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: c }}>{v}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* ---- Jobs ---- */}
            {data.jobs?.length > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <h2 style={{ marginTop: 0 }}>🔄 Jobs ในช่วงนี้</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>วันที่สร้าง</th><th>ช่วง</th><th>สถานะ</th>
                      <th>Chat</th><th>Messages</th><th>ใช้เวลา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map(j => {
                      const sec = j.started_at && j.finished_at
                        ? Math.round((new Date(j.finished_at) - new Date(j.started_at)) / 1000) : null;
                      const statusClr = { done: '#22c55e', running: '#3b82f6', error: '#ef4444', cancelled: '#9ca3af', pending: '#f59e0b' }[j.status] || '#888';
                      return (
                        <tr key={j.id}>
                          <td style={{ fontSize: 11, color: '#888' }}>{fmtTs(j.started_at || j.date_from)}</td>
                          <td style={{ fontSize: 12 }}>{j.date_from} — {j.date_to}</td>
                          <td><span style={{ color: statusClr, fontWeight: 700, fontSize: 12 }}>{j.status}</span></td>
                          <td>{j.total_chats || '—'}</td>
                          <td style={{ fontWeight: 700, color: j.logged_count > 0 ? '#22c55e' : '#999' }}>{j.logged_count || '—'}</td>
                          <td style={{ fontSize: 12 }}>{sec !== null ? `${sec}s` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ---- Customers ---- */}
            <div className="card">
              <h2 style={{ marginTop: 0 }}>👤 ลูกค้าที่ถูก Scrape</h2>
              {data.customers.length === 0
                ? <div style={{ color: '#999', padding: '16px 0' }}>ไม่มีข้อมูลในช่วงนี้</div>
                : data.customers.map(c => {
                    const open   = expanded.has(c.line_user_id);
                    const avgScr = c.messages.length
                      ? Math.round(c.messages.reduce((s, m) => s + (m.final_score ?? 0), 0) / c.messages.length)
                      : null;
                    return (
                      <div key={c.line_user_id} style={{
                        border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: 12, overflow: 'hidden',
                      }}>
                        {/* Header */}
                        <div onClick={() => toggle(c.line_user_id)} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                          background: '#f8fafc', cursor: 'pointer', userSelect: 'none',
                        }}>
                          {c.picture_url
                            ? <img src={c.picture_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                            : <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', fontSize: 16 }}>👤</div>
                          }
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{c.display_name || c.line_user_id}</div>
                            <div style={{ fontSize: 11, color: '#888' }}>{c.line_user_id}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
                            <span title="Messages">💬 {c.messages.length}</span>
                            <span title="Notes">📝 {c.notes.length}</span>
                            {avgScr !== null && (
                              <span style={{
                                background: scoreColor(avgScr), color: '#fff',
                                padding: '2px 8px', borderRadius: 8, fontWeight: 700, fontSize: 12,
                              }}>Score {avgScr}</span>
                            )}
                            <span style={{ fontSize: 16 }}>{open ? '▲' : '▼'}</span>
                          </div>
                        </div>

                        {/* Detail */}
                        {open && (
                          <div style={{ padding: '16px', background: '#fff' }}>
                            {/* Box 3: Messages */}
                            {c.messages.length > 0 && (
                              <>
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                                  borderLeft: '3px solid #f59e0b', paddingLeft: 10,
                                }}>
                                  <span style={{ fontWeight: 700, color: '#f59e0b', fontSize: 13 }}>
                                    💬 ข้อความ (กรอบ 3) — {c.messages.length} รายการ
                                  </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                                  {c.messages.map((msg, mi) => (
                                    <div key={mi} style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
                                      {/* Customer question */}
                                      {msg.customer_text && (
                                        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                                          <div style={{
                                            background: '#e5e7eb', borderRadius: 10, padding: '6px 12px',
                                            maxWidth: '70%', fontSize: 13,
                                          }}>
                                            <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>
                                              👤 ลูกค้า {msg.customer_created_at ? `• ${fmtTs(msg.customer_created_at)}` : ''}
                                            </div>
                                            {msg.customer_text}
                                          </div>
                                        </div>
                                      )}
                                      {/* Admin reply */}
                                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                        <div style={{
                                          background: '#1d4ed8', color: '#fff', borderRadius: 10,
                                          padding: '6px 12px', maxWidth: '70%', fontSize: 13,
                                        }}>
                                          <div style={{ fontSize: 10, color: '#93c5fd', marginBottom: 3 }}>
                                            🧑‍💼 {msg.admin_name || '(ไม่รู้ชื่อ)'}
                                            {msg.created_at ? ` • ${fmtTs(msg.created_at)}` : ''}
                                          </div>
                                          {msg.message_text}
                                          {msg.final_score != null && (
                                            <div style={{ marginTop: 6, display: 'flex', gap: 8, fontSize: 10 }}>
                                              <span style={{ background: scoreColor(msg.final_score), color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                                                ⭐ {msg.final_score}
                                              </span>
                                              {msg.response_seconds != null && (
                                                <span style={{ color: '#bfdbfe' }}>⏱ {msg.response_seconds}s</span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}

                            {/* Box 4: Notes */}
                            {c.notes.length > 0 && (
                              <>
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                                  borderLeft: '3px solid #a855f7', paddingLeft: 10,
                                }}>
                                  <span style={{ fontWeight: 700, color: '#a855f7', fontSize: 13 }}>
                                    📝 Notes (กรอบ 4) — {c.notes.length} รายการ
                                  </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {c.notes.map((n, ni) => (
                                    <div key={ni} style={{
                                      background: '#faf5ff', border: '1px solid #e9d5ff',
                                      borderRadius: 8, padding: 12,
                                    }}>
                                      <pre style={{
                                        margin: 0, fontSize: 12, whiteSpace: 'pre-wrap',
                                        color: '#1e293b', fontFamily: 'inherit',
                                      }}>{n.note_text}</pre>
                                      <div style={{ marginTop: 8, fontSize: 11, color: '#9333ea', display: 'flex', gap: 12 }}>
                                        {n.noted_at && <span>📅 {fmtTs(n.noted_at)}</span>}
                                        {n.noted_by && <span>✍️ {n.noted_by}</span>}
                                        {n.scraped_at && <span style={{ color: '#c4b5fd' }}>Scraped: {fmtTs(n.scraped_at)}</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}

                            {c.messages.length === 0 && c.notes.length === 0 && (
                              <div style={{ color: '#999', fontSize: 13 }}>ไม่มีข้อมูลในช่วงนี้</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
              }
            </div>
          </>
        )}
      </main>
    </div>
  );
}

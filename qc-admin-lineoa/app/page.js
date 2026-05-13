'use client';
import { useEffect, useState, useRef } from 'react';
import ChatModal from './components/ChatModal';

const toISO = d => d.toISOString().slice(0, 10);
const weekAgo = () => toISO(new Date(Date.now() - 7 * 86400000));
const todayStr = () => toISO(new Date());

function fmtSec(s) {
  s = Number(s || 0);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function scoreClass(v) { return v >= 85 ? 'good' : v >= 70 ? 'warn' : 'bad'; }
function scoreLabel(v) { return v >= 85 ? '✅ ดี' : v >= 70 ? '⚠️ พอใช้' : '❌ ต่ำ'; }
function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return `${s}s ที่แล้ว`;
  if (s < 3600) return `${Math.floor(s / 60)}m ที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ที่แล้ว`;
  return new Date(iso).toLocaleDateString('th-TH');
}
function fmtWeek(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const end = new Date(d); end.setDate(end.getDate() + 6);
  return `${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`;
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [now, setNow] = useState(new Date());
  const [lastFetch, setLastFetch] = useState(null);
  const [fetchOk, setFetchOk] = useState(null);
  const [expandAdmin, setExpandAdmin] = useState(null);
  const [chatUser, setChatUser] = useState(null);
  const [showAllAdmins, setShowAllAdmins] = useState(false);
  const [dateFrom, setDateFrom] = useState(weekAgo());
  const [dateTo, setDateTo] = useState(todayStr());
  const [filterApplied, setFilterApplied] = useState({ from: weekAgo(), to: todayStr() });
  const tickRef = useRef(null);
  const filterRef = useRef({ from: weekAgo(), to: todayStr() });

  const [rpPage, setRpPage] = useState(1);
  const [rpItems, setRpItems] = useState([]);
  const [rpTotal, setRpTotal] = useState(0);
  const [rpPages, setRpPages] = useState(0);
  const [rpLoading, setRpLoading] = useState(false);
  const [rpCust, setRpCust] = useState('');
  const [rpAdmin, setRpAdmin] = useState('');
  const [rpSort, setRpSort] = useState('date');
  const [rpOrder, setRpOrder] = useState('desc');

  const load = (from, to) => {
    const f = from || filterRef.current.from;
    const t = to   || filterRef.current.to;
    fetch(`/api/dashboard?from=${f}&to=${t}`)
      .then(r => r.json())
      .then(data => { setD(data); setLastFetch(new Date()); setFetchOk(!data.error); })
      .catch(() => setFetchOk(false));
  };

  function loadReplies(page = 1, cust = rpCust, admin = rpAdmin, sort = rpSort, order = rpOrder) {
    setRpLoading(true);
    const f = filterRef.current.from;
    const t = filterRef.current.to;
    fetch(`/api/replies?from=${f}&to=${t}&page=${page}&limit=20&customer=${encodeURIComponent(cust)}&admin=${encodeURIComponent(admin)}&sort=${sort}&order=${order}`)
      .then(r => r.json())
      .then(data => {
        setRpItems(data.items || []);
        setRpTotal(data.total || 0);
        setRpPages(data.pages || 0);
        setRpPage(data.page || 1);
      })
      .catch(() => {})
      .finally(() => setRpLoading(false));
  }

  useEffect(() => {
    load();
    loadReplies(1, '', '', 'date', 'desc');
    const api = setInterval(() => load(), 30000);
    tickRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(api); clearInterval(tickRef.current); };
  }, []);

  function applyFilter() {
    filterRef.current = { from: dateFrom, to: dateTo };
    setFilterApplied({ from: dateFrom, to: dateTo });
    load(dateFrom, dateTo);
    loadReplies(1);
  }
  function setPreset(days) {
    const f = toISO(new Date(Date.now() - days * 86400000));
    const t = todayStr();
    setDateFrom(f); setDateTo(t);
    filterRef.current = { from: f, to: t };
    setFilterApplied({ from: f, to: t });
    load(f, t);
    loadReplies(1);
  }

  const k  = d?.kpi || {};
  const la = d?.lastActivity || {};
  const systemAlive = fetchOk && lastFetch && (Date.now() - lastFetch) < 60000;
  const ranking = d?.ranking || [];
  const visibleRanking = showAllAdmins ? ranking : ranking.slice(0, 10);

  return (
    <>
    <div className="shell">
      <aside className="side">
        <div className="brand">QC<span>Admin</span></div>
        <nav className="nav">
          <a className="active" href="/">Dashboard</a>
          <a href="/admin">Admin Console</a>
          <a href="/scraper">Scraper</a>
          <a href="/rules">⚙️ QC Rules</a>
          <a href="/docs">Setup Docs</a>
          <a href="/PROJECT_DOCS.html" target="_blank">📄 Project Docs</a>
        </nav>
        <div style={{ marginTop: 'auto', padding: '16px 0', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: systemAlive ? '#22c55e' : '#ef4444',
              boxShadow: systemAlive ? '0 0 6px #22c55e' : 'none',
              display: 'inline-block', animation: systemAlive ? 'blink 2s infinite' : 'none',
            }} />
            <span style={{ color: systemAlive ? '#22c55e' : '#ef4444' }}>
              {systemAlive ? 'Online' : 'Offline'}
            </span>
          </div>
          <div style={{ color: '#888', lineHeight: 1.8 }}>
            <div>🕐 {now.toLocaleTimeString('th-TH')}</div>
            {lastFetch && <div style={{ fontSize: 11 }}>sync {timeAgo(lastFetch)}</div>}
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="top">
          <div>
            <h1>LINE OA Quality Dashboard</h1>
            <div className="muted">ตรวจความเร็ว ความถูกต้อง น้ำเสียง และคะแนนแอดมิน near real-time</div>
          </div>
          <div className="badge">v1</div>
        </div>

        {d?.error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
            ❌ {d.error}
          </div>
        )}

        {/* Date filter + activity bar */}
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>📅 ช่วงเวลา:</span>
            {[['วันนี้', 0], ['7 วัน', 7], ['30 วัน', 30], ['90 วัน', 90]].map(([label, days]) => (
              <button key={label} onClick={() => setPreset(days)} style={{
                padding: '4px 10px', fontSize: 12, borderRadius: 6,
                border: '1px solid #d1d5db', cursor: 'pointer',
                background: filterApplied.from === toISO(new Date(Date.now() - days * 86400000)) && filterApplied.to === todayStr() ? '#2196f3' : '#fff',
                color: filterApplied.from === toISO(new Date(Date.now() - days * 86400000)) && filterApplied.to === todayStr() ? '#fff' : '#555',
              }}>{label}</button>
            ))}
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6 }} />
            <span style={{ fontSize: 12, color: '#888' }}>–</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6 }} />
            <button onClick={applyFilter} style={{ padding: '4px 14px', fontSize: 12, background: '#2196f3', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              ค้นหา
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>
              {filterApplied.from} → {filterApplied.to}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 13, flexWrap: 'wrap' }}>
            <span><b>ลูกค้าล่าสุด:</b> <span style={{ color: '#2196f3' }}>{timeAgo(la.last_customer_msg)}</span></span>
            <span><b>แอดมินตอบล่าสุด:</b> <span style={{ color: '#22c55e' }}>{timeAgo(la.last_admin_reply)}</span></span>
            <span><b>ลูกค้าใหม่ล่าสุด:</b> <span style={{ color: '#f59e0b' }}>{timeAgo(la.last_new_customer)}</span></span>
            <span style={{ marginLeft: 'auto', color: '#999', fontSize: 12 }}>Server: {la.server_time ? new Date(la.server_time).toLocaleTimeString('th-TH') : '—'}</span>
          </div>
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

        {/* Daily summary */}
        {(d?.weeklySummary || []).length > 0 && (
          <section className="card" style={{ marginTop: 16 }}>
            <h2>สรุปรายวัน ({(d.weeklySummary || []).length} วัน)</h2>
            <table className="table">
              <thead>
                <tr><th>วันที่</th><th>Cases</th><th>Avg Score</th><th>ตอบเฉลี่ย</th><th>✅ ดี</th><th>❌ ต่ำ</th><th>Admin active</th></tr>
              </thead>
              <tbody>
                {(d.weeklySummary || []).map((w, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {w.day ? new Date(w.day).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                    </td>
                    <td>{w.total_cases}</td>
                    <td className={'score ' + scoreClass(w.avg_score)}>{w.avg_score}</td>
                    <td>{fmtSec(w.avg_response_sec)}</td>
                    <td style={{ color: '#22c55e' }}>{w.good}</td>
                    <td style={{ color: '#ef4444' }}>{w.bad}</td>
                    <td>{w.active_admins} คน</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="grid split" style={{ marginTop: 16 }}>
          {/* Admin ranking — top 10 + toggle */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>Ranking Admin</h2>
              <span style={{ fontSize: 12, color: '#888' }}>
                {showAllAdmins ? `ทั้งหมด ${ranking.length} คน` : `Top 10 / ${ranking.length} คน`}
              </span>
            </div>
            <table className="table">
              <thead>
                <tr><th>#</th><th>Admin</th><th>Cases</th><th>Score</th><th>ตอบเฉลี่ย</th><th>สมัคร</th><th>ยอดเติม</th><th>ตอบล่าสุด</th></tr>
              </thead>
              <tbody>
                {visibleRanking.map((r, i) => (
                  <>
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setExpandAdmin(expandAdmin === r.id ? null : r.id)}>
                      <td>{i + 1}</td>
                      <td><b>{r.member_name}</b></td>
                      <td>{r.cases}</td>
                      <td className={'score ' + scoreClass(r.avg_score)}>{r.avg_score} {scoreLabel(r.avg_score)}</td>
                      <td>{r.avg_response_sec > 0 ? fmtSec(r.avg_response_sec) : '—'}</td>
                      <td style={{ color: '#16a34a', fontWeight: 600 }}>{r.reg_count || 0}</td>
                      <td style={{ color: '#2196f3', fontWeight: 600 }}>{Number(r.deposit_sum || 0).toLocaleString()}</td>
                      <td style={{ fontSize: 12, color: '#888' }}>{r.last_reply_at ? timeAgo(r.last_reply_at) : '—'}</td>
                    </tr>
                    {expandAdmin === r.id && (
                      <tr key={r.id + '-d'}>
                        <td colSpan={8} style={{ background: '#f8fafc', padding: '8px 16px', fontSize: 13 }}>
                          <div style={{ display: 'flex', gap: 24, marginBottom: 6 }}>
                            <span>✅ ดี: <b style={{ color: '#22c55e' }}>{r.good}</b></span>
                            <span>⚠️ พอใช้: <b style={{ color: '#f59e0b' }}>{r.warn}</b></span>
                            <span>❌ ต่ำ: <b style={{ color: '#ef4444' }}>{r.bad}</b></span>
                            <span>📋 สมัคร: <b style={{ color: '#16a34a' }}>{r.reg_count || 0}</b></span>
                            <span>💰 เติม: <b style={{ color: '#2196f3' }}>{Number(r.deposit_sum || 0).toLocaleString()}</b></span>
                          </div>
                          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                            {(d?.replyLog || []).filter(x => x.admin_name === r.member_name).slice(0, 8).map((x, j) => (
                              <div key={j} style={{ padding: '4px 0', borderBottom: '1px solid #e5e7eb', display: 'grid', gridTemplateColumns: '100px 1fr 50px 28px', gap: 8 }}>
                                <span style={{ color: '#888', fontSize: 11 }}>{timeAgo(x.created_at)}</span>
                                <div>
                                  <div style={{ color: '#666', fontSize: 11 }}>👤 {x.line_user_id ? <a href={`/customer/${x.line_user_id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{x.customer_name || x.line_user_id.slice(0, 8)}</a> : (x.customer_name || '—')}: {x.customer_text?.slice(0, 40) || '—'}</div>
                                  <div style={{ fontSize: 12 }}>💬 {x.reply_text?.slice(0, 50)}</div>
                                  {x.fail_reasons && tryParse(x.fail_reasons).length > 0 && (
                                    <div style={{ color: '#ef4444', fontSize: 11 }}>⚠️ {tryParse(x.fail_reasons).join(', ')}</div>
                                  )}
                                </div>
                                <span className={'score ' + scoreClass(x.final_score || 0)} style={{ textAlign: 'center', alignSelf: 'center' }}>
                                  {x.final_score ?? '—'}
                                </span>
                                {x.line_user_id && (
                                  <button
                                    onClick={() => setChatUser({ line_user_id: x.line_user_id, name: x.customer_name || x.line_user_id })}
                                    style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', opacity: 0.7, padding: 0, alignSelf: 'center' }}
                                    title="ดูแชท">💬</button>
                                )}
                              </div>
                            ))}
                            {!(d?.replyLog || []).some(x => x.admin_name === r.member_name) && (
                              <div style={{ color: '#999', fontSize: 12 }}>ยังไม่มีประวัติ</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
            {ranking.length > 10 && (
              <button onClick={() => setShowAllAdmins(v => !v)} style={{
                marginTop: 8, width: '100%', padding: '6px', fontSize: 13,
                background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
              }}>
                {showAllAdmins ? '▲ แสดงน้อยลง' : `▼ แสดงทั้งหมด ${ranking.length} คน`}
              </button>
            )}
          </div>

          {/* Promo */}
          <div className="card">
            <h2>Promotion Performance</h2>
            <table className="table">
              <thead><tr><th>Promo</th><th>ลูกค้า</th><th>ยอดเติม</th></tr></thead>
              <tbody>
                {(d?.promos || []).map((p, i) => (
                  <tr key={i}><td>{p.promotion_code}</td><td>{p.customer_count}</td><td>{Number(p.total_amount || 0).toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reply log — paginated */}
        <section className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>ประวัติการตอบ</h2>
            {rpTotal > 0 && <span style={{ fontSize: 12, color: '#888' }}>ทั้งหมด {rpTotal} รายการ</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <input placeholder="ค้นหาลูกค้า..." value={rpCust} onChange={e => setRpCust(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadReplies(1)}
              style={{ padding: '5px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, width: 140 }} />
            <input placeholder="ค้นหา Admin..." value={rpAdmin} onChange={e => setRpAdmin(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadReplies(1)}
              style={{ padding: '5px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, width: 130 }} />
            <select value={rpSort} onChange={e => { setRpSort(e.target.value); loadReplies(1, rpCust, rpAdmin, e.target.value, rpOrder); }}
              style={{ padding: '5px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6 }}>
              <option value="date">เรียงตามวันที่</option>
              <option value="score">เรียงตาม Score</option>
              <option value="customer">เรียงตามลูกค้า</option>
              <option value="admin">เรียงตาม Admin</option>
            </select>
            <button onClick={() => { const o = rpOrder === 'desc' ? 'asc' : 'desc'; setRpOrder(o); loadReplies(1, rpCust, rpAdmin, rpSort, o); }}
              style={{ padding: '5px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', background: '#fff' }}>
              {rpOrder === 'desc' ? '↓ ใหม่สุด' : '↑ เก่าสุด'}
            </button>
            <button onClick={() => loadReplies(1)}
              style={{ padding: '5px 14px', fontSize: 12, background: '#2196f3', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              ค้นหา
            </button>
          </div>

          {rpLoading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#888' }}>กำลังโหลด...</div>
          ) : rpItems.length === 0 ? (
            <div style={{ color: '#999' }}>ไม่มีข้อมูลในช่วงเวลานี้</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr><th>เวลา</th><th>Admin</th><th>ลูกค้า</th><th>คำถาม</th><th>คำตอบ</th><th>เวลาตอบ</th><th>Score</th><th>ผล</th><th></th></tr>
                  </thead>
                  <tbody>
                    {rpItems.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>{timeAgo(r.created_at)}</td>
                        <td><b>{r.admin_name}</b></td>
                        <td style={{ fontSize: 12 }}>
                          {r.line_user_id
                            ? <a href={`/customer/${r.line_user_id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{r.customer_name || r.line_user_id?.slice(0, 8)}</a>
                            : (r.customer_name || '—')}
                        </td>
                        <td style={{ fontSize: 12, color: '#666', maxWidth: 140 }}>{r.customer_text?.slice(0, 35) || '—'}</td>
                        <td style={{ fontSize: 12, maxWidth: 160 }}>{r.reply_text?.slice(0, 40)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.response_seconds != null ? fmtSec(r.response_seconds) : '—'}</td>
                        <td className={'score ' + scoreClass(r.final_score || 0)}>{r.final_score ?? '—'}</td>
                        <td style={{ fontSize: 12 }}>
                          {r.final_score == null ? '—'
                            : r.final_score >= 70
                              ? <span style={{ color: '#22c55e' }}>✅ ผ่าน</span>
                              : <span style={{ color: '#ef4444' }}>❌ {tryParse(r.fail_reasons)[0] || 'ไม่ผ่าน'}</span>}
                        </td>
                        <td>
                          {r.line_user_id && (
                            <button
                              onClick={() => setChatUser({ line_user_id: r.line_user_id, name: r.customer_name || r.line_user_id })}
                              style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', opacity: 0.7, padding: 0 }}
                              title="ดูแชทเหมือน LINE">💬</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                <button disabled={rpPage <= 1} onClick={() => loadReplies(rpPage - 1)}
                  style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, cursor: rpPage <= 1 ? 'not-allowed' : 'pointer', background: '#fff', opacity: rpPage <= 1 ? 0.5 : 1 }}>
                  ◀ ก่อนหน้า
                </button>
                {Array.from({ length: Math.min(5, rpPages) }, (_, i) => {
                  const p = Math.max(1, rpPage - 2) + i;
                  if (p > rpPages) return null;
                  return (
                    <button key={p} onClick={() => loadReplies(p)}
                      style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', background: p === rpPage ? '#2196f3' : '#fff', color: p === rpPage ? '#fff' : '#333' }}>
                      {p}
                    </button>
                  );
                })}
                <button disabled={rpPage >= rpPages} onClick={() => loadReplies(rpPage + 1)}
                  style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, cursor: rpPage >= rpPages ? 'not-allowed' : 'pointer', background: '#fff', opacity: rpPage >= rpPages ? 0.5 : 1 }}>
                  ถัดไป ▶
                </button>
                <span style={{ fontSize: 12, color: '#888' }}>หน้า {rpPage}/{rpPages} (ทั้งหมด {rpTotal} รายการ)</span>
              </div>
            </>
          )}
        </section>

        {/* Pending Reply */}
        <section className="card" style={{ marginTop: 16 }}>
          <h2>⏳ รอตอบ ({(d?.pendingReply || []).length})</h2>
          {(d?.pendingReply || []).length === 0
            ? <div style={{ color: '#999', fontSize: 13 }}>ไม่มีการสนทนาที่รอตอบ ✅</div>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {(d.pendingReply || []).map(c => {
                  const mins = Math.round(Number(c.waiting_minutes || 0));
                  const urgentColor = mins > 60 ? '#ef4444' : mins > 30 ? '#f59e0b' : '#6b7280';
                  const urgentBg    = mins > 60 ? '#fef2f2' : mins > 30 ? '#fffbeb' : '#f8fafc';
                  const borderColor = mins > 60 ? '#fca5a5' : mins > 30 ? '#fcd34d' : '#e5e7eb';
                  return (
                    <div key={c.id} style={{ border: `1px solid ${borderColor}`, borderRadius: 8, padding: '10px 14px', background: urgentBg }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        {c.line_user_id
                          ? <a href={`/customer/${c.line_user_id}`} style={{ fontWeight: 600, color: '#1d4ed8', textDecoration: 'none', fontSize: 14 }}>{c.display_name || c.line_user_id?.slice(0, 12)}</a>
                          : <b style={{ fontSize: 14 }}>{c.display_name || '—'}</b>}
                        <span style={{ fontSize: 12, fontWeight: 700, color: urgentColor }}>รอ {mins} นาที</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>💬 {(c.last_customer_msg || '—').slice(0, 40)}</div>
                      {c.assigned_admin && <div style={{ fontSize: 11, color: '#888' }}>แอดมิน: {c.assigned_admin}</div>}
                    </div>
                  );
                })}
              </div>
            )}
        </section>
      </main>

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>

    <ChatModal user={chatUser} onClose={() => setChatUser(null)} />
    </>
  );
}

function K({ title, v }) {
  return <div className="card"><div className="kpi-title">{title}</div><div className="kpi-value">{v}</div></div>;
}
function tryParse(v) {
  try { return Array.isArray(v) ? v : JSON.parse(v) || []; } catch { return []; }
}

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
  const [rpCust, setRpCust] = useState('');
  const [rpCustFilter, setRpCustFilter] = useState('');
  const [rpSort, setRpSort] = useState('date');
  const [rpOrder, setRpOrder] = useState('desc');
  const [rpExpanded, setRpExpanded] = useState(new Set());

  const load = (from, to) => {
    const f = from || filterRef.current.from;
    const t = to   || filterRef.current.to;
    fetch(`/api/dashboard?from=${f}&to=${t}`)
      .then(r => r.json())
      .then(data => { setD(data); setLastFetch(new Date()); setFetchOk(!data.error); })
      .catch(() => setFetchOk(false));
  };

  useEffect(() => {
    load();
    const api = setInterval(() => load(), 30000);
    tickRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(api); clearInterval(tickRef.current); };
  }, []);

  function applyFilter() {
    filterRef.current = { from: dateFrom, to: dateTo };
    setFilterApplied({ from: dateFrom, to: dateTo });
    load(dateFrom, dateTo);
    setRpPage(1);
  }
  function setPreset(days) {
    const f = toISO(new Date(Date.now() - days * 86400000));
    const t = todayStr();
    setDateFrom(f); setDateTo(t);
    filterRef.current = { from: f, to: t };
    setFilterApplied({ from: f, to: t });
    load(f, t);
    setRpPage(1);
  }

  function applyRpFilter() {
    setRpCustFilter(rpCust);
    setRpPage(1);
  }
  function toggleRpExpand(key) {
    setRpExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const k  = d?.kpi || {};
  const la = d?.lastActivity || {};
  const systemAlive = fetchOk && lastFetch && (Date.now() - lastFetch) < 60000;
  const ranking = d?.ranking || [];
  const visibleRanking = showAllAdmins ? ranking : ranking.slice(0, 10);

  // Reply log — group by customer, client-side filter / sort / pagination
  const RP_PER_PAGE = 20;
  const replyLogSrc = d?.replyLog || [];
  const rpGroupMap = {};
  for (const r of replyLogSrc) {
    const key = r.line_user_id || r.customer_name || '?';
    if (!rpGroupMap[key]) {
      rpGroupMap[key] = { line_user_id: r.line_user_id, customer_name: r.customer_name, msgs: [], scores: [], admins: [], last_at: null };
    }
    const g = rpGroupMap[key];
    g.msgs.push(r);
    if (r.final_score != null) g.scores.push(r.final_score);
    if (r.admin_name && !g.admins.includes(r.admin_name)) g.admins.push(r.admin_name);
    if (!g.last_at || new Date(r.created_at) > new Date(g.last_at)) g.last_at = r.created_at;
  }
  const rpAllGroups = Object.values(rpGroupMap).map(g => ({
    ...g,
    avg_score: g.scores.length ? Math.round(g.scores.reduce((a, b) => a + b, 0) / g.scores.length) : null,
    count: g.msgs.length,
  }));
  const rpFiltered = rpAllGroups
    .filter(g => !rpCustFilter || (g.customer_name || g.line_user_id || '').toLowerCase().includes(rpCustFilter.toLowerCase()))
    .sort((a, b) => {
      const dir = rpOrder === 'desc' ? -1 : 1;
      if (rpSort === 'score')    return dir * ((a.avg_score || 0) - (b.avg_score || 0));
      if (rpSort === 'customer') return dir * (a.customer_name || a.line_user_id || '').localeCompare(b.customer_name || b.line_user_id || '');
      if (rpSort === 'admin')    return dir * (a.admins[0] || '').localeCompare(b.admins[0] || '');
      return dir * (new Date(a.last_at) - new Date(b.last_at));
    });
  const rpTotal  = rpFiltered.length;
  const rpPages  = Math.max(1, Math.ceil(rpTotal / RP_PER_PAGE));
  const rpSafePg = Math.min(rpPage, rpPages);
  const rpItems  = rpFiltered.slice((rpSafePg - 1) * RP_PER_PAGE, rpSafePg * RP_PER_PAGE);

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

        {/* Reply log — grouped by customer */}
        <section className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>ประวัติการตอบ</h2>
            {rpTotal > 0 && (
              <span style={{ fontSize: 12, color: '#888' }}>
                {rpTotal} ลูกค้า · {replyLogSrc.length} ข้อความ{replyLogSrc.length >= 100 ? ' (แสดงสูงสุด 100)' : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <input placeholder="ค้นหาลูกค้า..." value={rpCust} onChange={e => setRpCust(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyRpFilter()}
              style={{ padding: '5px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, width: 150 }} />
            <select value={rpSort} onChange={e => { setRpSort(e.target.value); setRpPage(1); }}
              style={{ padding: '5px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6 }}>
              <option value="date">เรียงตามเวลาล่าสุด</option>
              <option value="score">เรียงตาม Score</option>
              <option value="customer">เรียงตามชื่อลูกค้า</option>
              <option value="admin">เรียงตาม Admin</option>
            </select>
            <button onClick={() => { setRpOrder(o => o === 'desc' ? 'asc' : 'desc'); setRpPage(1); }}
              style={{ padding: '5px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', background: '#fff' }}>
              {rpOrder === 'desc' ? '↓ ใหม่สุด' : '↑ เก่าสุด'}
            </button>
            <button onClick={applyRpFilter}
              style={{ padding: '5px 14px', fontSize: 12, background: '#2196f3', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              ค้นหา
            </button>
          </div>

          {rpItems.length === 0 ? (
            <div style={{ color: '#999' }}>ไม่มีข้อมูลในช่วงเวลานี้</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr><th>ลูกค้า</th><th>ข้อความ</th><th>Admin</th><th>Avg Score</th><th>ตอบล่าสุด</th><th style={{ width: 28 }}></th></tr>
                  </thead>
                  <tbody>
                    {rpItems.map(g => {
                      const key = g.line_user_id || g.customer_name || '?';
                      const isExp = rpExpanded.has(key);
                      return (
                        <>
                          <tr key={key} style={{ cursor: 'pointer', background: isExp ? '#f0f9ff' : undefined }}
                            onClick={() => toggleRpExpand(key)}>
                            <td style={{ fontWeight: 600 }}>
                              {g.line_user_id
                                ? <a href={`/customer/${g.line_user_id}`} onClick={e => e.stopPropagation()}
                                    style={{ color: '#2563eb', textDecoration: 'none' }}>
                                    {g.customer_name || g.line_user_id?.slice(0, 12)}
                                  </a>
                                : (g.customer_name || '—')}
                            </td>
                            <td>{g.count} ข้อความ</td>
                            <td style={{ fontSize: 12, color: '#555' }}>{g.admins.slice(0, 3).join(', ')}{g.admins.length > 3 ? ` +${g.admins.length - 3}` : ''}</td>
                            <td className={'score ' + scoreClass(g.avg_score || 0)}>{g.avg_score ?? '—'}</td>
                            <td style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>{timeAgo(g.last_at)}</td>
                            <td style={{ textAlign: 'center', color: '#888' }}>{isExp ? '▲' : '▼'}</td>
                          </tr>
                          {isExp && (
                            <tr key={key + '-exp'}>
                              <td colSpan={6} style={{ background: '#f8fafc', padding: '6px 16px 10px' }}>
                                {g.msgs.map((r, j) => (
                                  <div key={j} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 50px 28px', gap: 8, padding: '5px 0', borderBottom: '1px solid #e5e7eb' }}>
                                    <span style={{ fontSize: 11, color: '#888' }}>{timeAgo(r.created_at)}</span>
                                    <div>
                                      <div style={{ fontSize: 11, color: '#666' }}>👤 {r.customer_text?.slice(0, 45) || '—'}</div>
                                      <div style={{ fontSize: 12 }}>💬 {r.reply_text?.slice(0, 55)}</div>
                                      <div style={{ fontSize: 11, color: '#999' }}>{r.admin_name} · {r.response_seconds != null ? fmtSec(r.response_seconds) : '—'}</div>
                                      {r.fail_reasons && tryParse(r.fail_reasons).length > 0 && (
                                        <div style={{ color: '#ef4444', fontSize: 11 }}>⚠️ {tryParse(r.fail_reasons).join(', ')}</div>
                                      )}
                                    </div>
                                    <span className={'score ' + scoreClass(r.final_score || 0)} style={{ textAlign: 'center', alignSelf: 'center' }}>
                                      {r.final_score ?? '—'}
                                    </span>
                                    {r.line_user_id && (
                                      <button onClick={() => setChatUser({ line_user_id: r.line_user_id, name: r.customer_name || r.line_user_id })}
                                        style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', opacity: 0.7, padding: 0, alignSelf: 'center' }}
                                        title="ดูแชท">💬</button>
                                    )}
                                  </div>
                                ))}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                <button disabled={rpSafePg <= 1} onClick={() => setRpPage(rpSafePg - 1)}
                  style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, cursor: rpSafePg <= 1 ? 'not-allowed' : 'pointer', background: '#fff', opacity: rpSafePg <= 1 ? 0.5 : 1 }}>
                  ◀ ก่อนหน้า
                </button>
                {Array.from({ length: Math.min(5, rpPages) }, (_, i) => {
                  const p = Math.max(1, rpSafePg - 2) + i;
                  if (p > rpPages) return null;
                  return (
                    <button key={p} onClick={() => setRpPage(p)}
                      style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', background: p === rpSafePg ? '#2196f3' : '#fff', color: p === rpSafePg ? '#fff' : '#333' }}>
                      {p}
                    </button>
                  );
                })}
                <button disabled={rpSafePg >= rpPages} onClick={() => setRpPage(rpSafePg + 1)}
                  style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, cursor: rpSafePg >= rpPages ? 'not-allowed' : 'pointer', background: '#fff', opacity: rpSafePg >= rpPages ? 0.5 : 1 }}>
                  ถัดไป ▶
                </button>
                <span style={{ fontSize: 12, color: '#888' }}>หน้า {rpSafePg}/{rpPages} ({rpTotal} ลูกค้า)</span>
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

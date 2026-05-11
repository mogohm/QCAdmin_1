'use client';
import { useEffect, useRef, useState } from 'react';

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateSep(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' });
}
function fmtSec(s) {
  s = Number(s || 0); if (s <= 0) return null;
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
function scoreColor(v) { return v >= 85 ? '#22c55e' : v >= 70 ? '#f59e0b' : '#ef4444'; }
function tryParse(v) { try { return Array.isArray(v) ? v : (JSON.parse(v) || []); } catch { return []; } }
function sameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export default function ChatModal({ user, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!user?.line_user_id) { setData(null); return; }
    setLoading(true); setData(null); setActiveId(null);
    fetch(`/api/chat/${user.line_user_id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user?.line_user_id]);

  useEffect(() => {
    if (data) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, [data]);

  // Close on Escape
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!user) return null;

  const msgs = data?.messages || [];
  const customer = data?.customer;
  const adminMsgs = msgs.filter(m => m.final_score != null);
  const avgScore = adminMsgs.length
    ? Math.round(adminMsgs.reduce((s, m) => s + m.final_score, 0) / adminMsgs.length) : null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 1000, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(440px, 100vw)',
        background: '#e8f4e8',
        zIndex: 1001,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.25)',
        fontFamily: "'Segoe UI', 'Noto Sans Thai', sans-serif",
        animation: 'slideIn 0.18s ease-out',
      }}>

        {/* Header */}
        <div style={{
          background: '#00b900', color: '#fff',
          padding: '0 14px', height: 58,
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.22)', border: 'none', color: '#fff',
            borderRadius: '50%', width: 32, height: 32, cursor: 'pointer',
            fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>✕</button>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
          }}>👤</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {customer?.display_name || user.name || user.line_user_id}
            </div>
            <div style={{ fontSize: 10, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.line_user_id}
            </div>
          </div>
          <div style={{ fontSize: 11, textAlign: 'right', opacity: 0.9, lineHeight: 1.5, flexShrink: 0 }}>
            <div>{msgs.length} ข้อความ</div>
            {avgScore != null && (
              <div style={{ fontWeight: 700, color: scoreColor(avgScore) === '#22c55e' ? '#c8ffb0' : scoreColor(avgScore) === '#f59e0b' ? '#ffe4a0' : '#ffcdd2' }}>
                avg {avgScore}
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 16px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 48, color: '#555', fontSize: 14 }}>⏳ กำลังโหลด...</div>
          )}
          {!loading && msgs.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, color: '#666', fontSize: 14 }}>ไม่พบข้อมูลแชท</div>
          )}

          {msgs.map((msg, i) => {
            const isAdmin = msg.direction === 'admin';
            const prev = msgs[i - 1];
            const showDate = !prev || !sameDay(prev.created_at, msg.created_at);
            const isActive = activeId === msg.id;

            return (
              <div key={msg.id}>
                {/* Date separator */}
                {showDate && (
                  <div style={{ textAlign: 'center', margin: '14px 0 8px', fontSize: 11, color: '#555' }}>
                    <span style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 100, padding: '3px 12px' }}>
                      {fmtDateSep(msg.created_at)}
                    </span>
                  </div>
                )}

                {/* Row */}
                <div style={{
                  display: 'flex',
                  flexDirection: isAdmin ? 'row-reverse' : 'row',
                  alignItems: 'flex-end', gap: 6, marginBottom: 3,
                }}>
                  {/* Customer avatar */}
                  {!isAdmin && (
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: '#bbb', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 14, alignSelf: 'flex-end',
                    }}>👤</div>
                  )}

                  <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isAdmin ? 'flex-end' : 'flex-start' }}>
                    {/* Admin name */}
                    {isAdmin && msg.admin_name && (
                      <div style={{ fontSize: 10, color: '#444', marginBottom: 1, marginRight: 2 }}>
                        {msg.admin_name}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flexDirection: isAdmin ? 'row-reverse' : 'row' }}>
                      {/* QC score badge */}
                      {isAdmin && msg.final_score != null && (
                        <div
                          onClick={() => setActiveId(isActive ? null : msg.id)}
                          style={{
                            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                            background: scoreColor(msg.final_score), color: '#fff',
                            fontSize: 9, fontWeight: 800, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                            marginBottom: 2,
                          }}
                          title="คลิกดูรายละเอียด QC"
                        >
                          {msg.final_score}
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        onClick={() => isAdmin && msg.final_score != null && setActiveId(isActive ? null : msg.id)}
                        style={{
                          background: isAdmin ? '#c8f7c5' : '#fff',
                          borderRadius: isAdmin ? '16px 3px 16px 16px' : '3px 16px 16px 16px',
                          padding: '9px 13px', fontSize: 13, lineHeight: 1.5,
                          color: '#1a1a1a', wordBreak: 'break-word',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                          cursor: isAdmin && msg.final_score != null ? 'pointer' : 'default',
                          border: isActive ? `2px solid ${scoreColor(msg.final_score)}` : '2px solid transparent',
                        }}
                      >
                        {msg.message_text}
                      </div>

                      {/* Time */}
                      <div style={{ fontSize: 9, color: '#888', marginBottom: 2, whiteSpace: 'nowrap' }}>
                        {fmtTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* QC Detail card */}
                {isAdmin && isActive && msg.final_score != null && (
                  <div style={{
                    margin: '3px 0 8px auto', maxWidth: 340,
                    background: '#fff', borderRadius: 10, padding: '12px 14px',
                    border: `1.5px solid ${scoreColor(msg.final_score)}`,
                    fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  }}>
                    {/* Score bars */}
                    <div style={{ display: 'flex', gap: 14, marginBottom: 8 }}>
                      {[['⚡', 'เร็ว', msg.speed_score], ['✅', 'ถูกต้อง', msg.correctness_score], ['😊', 'น้ำเสียง', msg.sentiment_score]].map(([icon, label, val]) => (
                        <div key={label} style={{ textAlign: 'center', flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: scoreColor(val) }}>{val}</div>
                          <div style={{ fontSize: 9, color: '#888' }}>{icon} {label}</div>
                        </div>
                      ))}
                      <div style={{ textAlign: 'center', borderLeft: '1px solid #eee', paddingLeft: 14 }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: scoreColor(msg.final_score) }}>{msg.final_score}</div>
                        <div style={{ fontSize: 9, color: '#888' }}>Final</div>
                      </div>
                    </div>

                    {fmtSec(msg.response_seconds) && (
                      <div style={{ color: '#555', marginBottom: 6, fontSize: 11 }}>
                        🕐 ตอบใน <b>{fmtSec(msg.response_seconds)}</b>
                      </div>
                    )}

                    {msg.paired_customer_text && (
                      <div style={{ background: '#eff6ff', borderLeft: '3px solid #3b82f6', borderRadius: '0 6px 6px 0', padding: '6px 10px', marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: '#1d4ed8', fontWeight: 700, marginBottom: 2 }}>🔗 คำถามที่จับคู่</div>
                        <div style={{ color: '#1e3a8a', fontSize: 12 }}>{msg.paired_customer_text}</div>
                      </div>
                    )}

                    {tryParse(msg.fail_reasons).length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        {tryParse(msg.fail_reasons).map((r, j) => (
                          <div key={j} style={{ color: '#dc2626', fontSize: 11 }}>⚠️ {r}</div>
                        ))}
                      </div>
                    )}

                    {tryParse(msg.matched_rules).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                        {tryParse(msg.matched_rules).map((r, j) => (
                          <span key={j} style={{
                            padding: '1px 7px', borderRadius: 100, fontSize: 10, fontWeight: 600,
                            background: r.pass ? '#dcfce7' : '#fee2e2',
                            color: r.pass ? '#16a34a' : '#dc2626',
                          }}>{r.pass ? '✓' : '✗'} {r.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Footer stats */}
        <div style={{
          background: '#f5f5f5', borderTop: '1px solid #ddd',
          padding: '8px 14px', display: 'flex', gap: 14, fontSize: 12, color: '#666',
          flexShrink: 0, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span>💬 {msgs.filter(m => m.direction === 'customer').length}</span>
          <span>🤝 {msgs.filter(m => m.direction === 'admin').length}</span>
          {customer?.deposit_amount > 0 && (
            <span>💰 {Number(customer.deposit_amount).toLocaleString()} บาท</span>
          )}
          {avgScore != null && (
            <span style={{ fontWeight: 700, color: scoreColor(avgScore) }}>📊 avg {avgScore}</span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#aaa' }}>คลิกฟองแอดมินเพื่อดูคะแนน</span>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

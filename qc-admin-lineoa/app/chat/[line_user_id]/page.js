'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtSec(s) {
  s = Number(s || 0);
  if (s <= 0) return null;
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function scoreColor(v) {
  return v >= 85 ? '#22c55e' : v >= 70 ? '#f59e0b' : '#ef4444';
}
function tryParse(v) {
  try { return Array.isArray(v) ? v : (JSON.parse(v) || []); } catch { return []; }
}
function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export default function ChatView() {
  const { line_user_id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!line_user_id) return;
    fetch(`/api/chat/${line_user_id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [line_user_id]);

  useEffect(() => {
    if (data) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data]);

  const customer = data?.customer;
  const messages = data?.messages || [];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      background: '#e8f4e8', fontFamily: "'Segoe UI', 'Noto Sans Thai', sans-serif",
    }}>

      {/* ── Header ── */}
      <div style={{
        background: '#00b900', color: '#fff',
        padding: '0 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        height: 60, flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => window.close()} style={{
          background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
          borderRadius: '50%', width: 34, height: 34, cursor: 'pointer',
          fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <div style={{
          width: 38, height: 38, borderRadius: '50%',
          background: 'rgba(255,255,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0,
        }}>👤</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {customer?.display_name || line_user_id}
          </div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>{line_user_id}</div>
        </div>
        <div style={{ fontSize: 12, textAlign: 'right', opacity: 0.9 }}>
          <div>{messages.length} ข้อความ</div>
          {customer?.deposit_amount > 0 && (
            <div>💰 {Number(customer.deposit_amount).toLocaleString()} บาท</div>
          )}
        </div>
      </div>

      {/* ── Chat Area ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 20px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>⏳ กำลังโหลด...</div>
        )}
        {!loading && messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>ไม่พบข้อมูลแชท</div>
        )}

        {messages.map((msg, i) => {
          const isAdmin = msg.direction === 'admin';
          const prev = messages[i - 1];
          const showDate = !prev || !isSameDay(prev.created_at, msg.created_at);
          const isSelected = selectedMsg === msg.id;

          return (
            <div key={msg.id}>
              {/* Date separator */}
              {showDate && (
                <div style={{
                  textAlign: 'center', margin: '16px 0 10px',
                  fontSize: 12, color: '#555',
                }}>
                  <span style={{
                    background: 'rgba(0,0,0,0.12)', borderRadius: 100,
                    padding: '4px 14px',
                  }}>{fmtDate(msg.created_at)}</span>
                </div>
              )}

              {/* Message row */}
              <div style={{
                display: 'flex',
                flexDirection: isAdmin ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                gap: 8,
                marginBottom: 4,
              }}>
                {/* Avatar (customer only) */}
                {!isAdmin && (
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: '#ccc', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, alignSelf: 'flex-end',
                  }}>👤</div>
                )}

                <div style={{ maxWidth: '70%', display: 'flex', flexDirection: 'column', alignItems: isAdmin ? 'flex-end' : 'flex-start' }}>
                  {/* Admin name */}
                  {isAdmin && msg.admin_name && (
                    <div style={{ fontSize: 11, color: '#555', marginBottom: 2, marginRight: 4 }}>
                      {msg.admin_name}
                    </div>
                  )}

                  {/* Bubble + time row */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flexDirection: isAdmin ? 'row-reverse' : 'row' }}>

                    {/* QC score (admin only, left of bubble) */}
                    {isAdmin && msg.final_score != null && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginBottom: 2 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: scoreColor(msg.final_score),
                          color: '#fff', fontSize: 10, fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                        }} onClick={() => setSelectedMsg(isSelected ? null : msg.id)}
                          title="คลิกดูรายละเอียด QC">
                          {msg.final_score}
                        </div>
                      </div>
                    )}

                    {/* Bubble */}
                    <div
                      onClick={() => isAdmin && setSelectedMsg(isSelected ? null : msg.id)}
                      style={{
                        background: isAdmin ? '#c8f7c5' : '#fff',
                        borderRadius: isAdmin ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
                        padding: '10px 14px',
                        fontSize: 14, lineHeight: 1.5,
                        color: '#1a1a1a',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        cursor: isAdmin ? 'pointer' : 'default',
                        border: isSelected ? '2px solid #00b900' : '2px solid transparent',
                        wordBreak: 'break-word',
                      }}
                    >
                      {msg.message_text}
                    </div>

                    {/* Time */}
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 2, whiteSpace: 'nowrap' }}>
                      {fmtTime(msg.created_at)}
                    </div>
                  </div>
                </div>
              </div>

              {/* QC Detail Panel (expanded) */}
              {isAdmin && isSelected && msg.final_score != null && (
                <div style={{
                  margin: '4px 0 8px auto',
                  maxWidth: 360,
                  background: '#fff',
                  border: `2px solid ${scoreColor(msg.final_score)}`,
                  borderRadius: 12,
                  padding: '12px 16px',
                  fontSize: 12,
                }}>
                  {/* Scores row */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                    {[
                      ['⚡ ความเร็ว', msg.speed_score],
                      ['✅ ความถูกต้อง', msg.correctness_score],
                      ['😊 น้ำเสียง', msg.sentiment_score],
                    ].map(([label, val]) => (
                      <div key={label} style={{ textAlign: 'center' }}>
                        <div style={{ color: scoreColor(val), fontWeight: 800, fontSize: 16 }}>{val}</div>
                        <div style={{ color: '#888', fontSize: 10 }}>{label}</div>
                      </div>
                    ))}
                    <div style={{ textAlign: 'center', marginLeft: 'auto' }}>
                      <div style={{ color: scoreColor(msg.final_score), fontWeight: 800, fontSize: 22 }}>{msg.final_score}</div>
                      <div style={{ color: '#888', fontSize: 10 }}>Final</div>
                    </div>
                  </div>

                  {/* Response time */}
                  {fmtSec(msg.response_seconds) && (
                    <div style={{ color: '#666', marginBottom: 6 }}>
                      🕐 เวลาตอบ: <b>{fmtSec(msg.response_seconds)}</b>
                    </div>
                  )}

                  {/* Paired customer question */}
                  {msg.paired_customer_text && (
                    <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '6px 10px', marginBottom: 6, borderLeft: '3px solid #0ea5e9' }}>
                      <div style={{ color: '#0369a1', fontSize: 10, fontWeight: 700, marginBottom: 2 }}>คำถามที่จับคู่</div>
                      <div style={{ color: '#1e40af' }}>{msg.paired_customer_text}</div>
                    </div>
                  )}

                  {/* Fail reasons */}
                  {tryParse(msg.fail_reasons).length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {tryParse(msg.fail_reasons).map((r, j) => (
                        <div key={j} style={{ color: '#dc2626', fontSize: 11 }}>⚠️ {r}</div>
                      ))}
                    </div>
                  )}

                  {/* Matched rules */}
                  {tryParse(msg.matched_rules).length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {tryParse(msg.matched_rules).map((r, j) => (
                        <span key={j} style={{
                          padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 600,
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

      {/* ── Bottom bar ── */}
      <div style={{
        background: '#f5f5f5', borderTop: '1px solid #ddd',
        padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center',
        flexShrink: 0, fontSize: 13, color: '#666',
      }}>
        <span>💬 {messages.filter(m => m.direction === 'customer').length} ข้อความลูกค้า</span>
        <span>🤝 {messages.filter(m => m.direction === 'admin').length} ข้อความแอดมิน</span>
        {messages.filter(m => m.final_score != null).length > 0 && (
          <span>📊 avg score: <b style={{ color: scoreColor(
            Math.round(messages.filter(m => m.final_score != null).reduce((s, m) => s + m.final_score, 0) /
              messages.filter(m => m.final_score != null).length)
          ) }}>
            {Math.round(messages.filter(m => m.final_score != null).reduce((s, m) => s + m.final_score, 0) /
              messages.filter(m => m.final_score != null).length)}
          </b></span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11 }}>คลิกฟองแชทแอดมินเพื่อดูคะแนน QC</span>
      </div>
    </div>
  );
}

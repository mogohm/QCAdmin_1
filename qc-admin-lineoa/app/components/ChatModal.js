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
function tryParseObj(v) { try { return typeof v === 'object' ? v : (JSON.parse(v) || null); } catch { return null; } }
function sameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export default function ChatModal({ user, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [disputeFor, setDisputeFor] = useState(null); // qc_score_id
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeMsg, setDisputeMsg] = useState('');
  const bottomRef = useRef(null);

  const submitDispute = async (qcScoreId) => {
    if (!disputeReason.trim()) { setDisputeMsg('กรอกเหตุผล'); return; }
    const r = await fetch('/api/qc-disputes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qc_score_id: qcScoreId, reason: disputeReason }) });
    const j = await r.json();
    setDisputeMsg(j.ok ? '✅ ส่งคำโต้แย้งแล้ว รอ Manager ตรวจ' : '⚠️ ' + (j.error || 'error'));
    if (j.ok) { setDisputeReason(''); setTimeout(() => { setDisputeFor(null); setDisputeMsg(''); }, 1800); }
  };

  useEffect(() => {
    if (!user?.line_user_id) { setData(null); setError(null); return; }
    setLoading(true); setData(null); setError(null); setActiveId(null);
    fetch(`/api/chat/${user.line_user_id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch(err => { setError(String(err)); setLoading(false); });
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
          {!loading && error && (
            <div style={{ textAlign: 'center', padding: 32, color: '#dc2626', fontSize: 13 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>เกิดข้อผิดพลาด</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, background: '#fef2f2', padding: 8, borderRadius: 6, wordBreak: 'break-all' }}>{error}</div>
            </div>
          )}
          {!loading && !error && msgs.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, color: '#666', fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div>ไม่พบข้อมูลแชท</div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{user?.line_user_id}</div>
            </div>
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

                {/* QC Detail card (Phase 2) */}
                {isAdmin && isActive && msg.final_score != null && (() => {
                  const dims = (typeof msg.dimension_scores === 'object' ? msg.dimension_scores : tryParseObj(msg.dimension_scores)) || {};
                  const coaching = (typeof msg.coaching === 'object' ? msg.coaching : tryParseObj(msg.coaching)) || null;
                  const ev = (typeof msg.evidence === 'object' ? msg.evidence : tryParseObj(msg.evidence)) || {};
                  const DIM_LABELS = { greetingClosing: 'Greeting/Closing', problemSolving: 'Problem Solving', communicationTone: 'Tone', responseTime: 'Response', upsellPromotion: 'Upsell', creditDepositWithdraw: 'Deposit/WD', kycProcess: 'KYC' };
                  return (
                  <div style={{ margin: '3px 0 8px auto', maxWidth: 360, background: '#fff', borderRadius: 10, padding: '12px 14px', border: `1.5px solid ${scoreColor(msg.final_score)}`, fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    {/* header flags */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(msg.final_score) }}>{msg.final_score}</div>
                      <span style={{ fontSize: 10, color: '#666' }}>Final</span>
                      {msg.intent && <span style={{ background: '#eef2ff', color: '#4338ca', borderRadius: 100, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>{msg.intent}</span>}
                      {msg.is_fatal && <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 100, padding: '1px 8px', fontSize: 10, fontWeight: 800 }}>FATAL</span>}
                      {msg.sla_exception && <span style={{ background: '#fef9c3', color: '#a16207', borderRadius: 100, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>SLA exception</span>}
                    </div>

                    {/* dimension bars */}
                    <div style={{ marginBottom: 8 }}>
                      {Object.keys(DIM_LABELS).filter(k => dims[k] != null).map(k => (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0' }}>
                          <span style={{ width: 92, fontSize: 10, color: '#666' }}>{DIM_LABELS[k]}</span>
                          <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 5, height: 7 }}><div style={{ width: dims[k] + '%', height: 7, borderRadius: 5, background: scoreColor(dims[k]) }} /></div>
                          <b style={{ width: 22, textAlign: 'right', fontSize: 10, color: scoreColor(dims[k]) }}>{dims[k]}</b>
                        </div>
                      ))}
                    </div>

                    {fmtSec(msg.response_seconds) && <div style={{ color: '#555', marginBottom: 6, fontSize: 11 }}>🕐 ตอบใน <b>{fmtSec(msg.response_seconds)}</b></div>}

                    {msg.paired_customer_text && (
                      <div style={{ background: '#eff6ff', borderLeft: '3px solid #3b82f6', borderRadius: '0 6px 6px 0', padding: '6px 10px', marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: '#1d4ed8', fontWeight: 700, marginBottom: 2 }}>❓ คำถามลูกค้า</div>
                        <div style={{ color: '#1e3a8a', fontSize: 12 }}>{msg.paired_customer_text}</div>
                      </div>
                    )}

                    {msg.matched_sop_topic && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 10, color: '#0369a1', fontWeight: 700 }}>📋 SOP: {msg.matched_sop_topic} {msg.sop_confidence != null && <span style={{ color: '#888' }}>({msg.sop_confidence}%)</span>}</div>
                        {msg.expected_sop_answer && <div style={{ fontSize: 11, color: '#555', background: '#f8fafc', borderRadius: 6, padding: '5px 8px', marginTop: 3 }}>ควรตอบ: {String(msg.expected_sop_answer).slice(0, 160)}…</div>}
                      </div>
                    )}

                    {/* evidence */}
                    {(ev.missing_required_keywords?.length > 0 || ev.forbidden_keyword_hit?.length > 0) && (
                      <div style={{ fontSize: 10, marginBottom: 6 }}>
                        {ev.missing_required_keywords?.length > 0 && <div style={{ color: '#b45309' }}>ขาดคำสำคัญ: {ev.missing_required_keywords.join(', ')}</div>}
                        {ev.forbidden_keyword_hit?.length > 0 && <div style={{ color: '#dc2626' }}>คำต้องห้าม: {ev.forbidden_keyword_hit.join(', ')}</div>}
                      </div>
                    )}

                    {tryParse(msg.fail_reasons).length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        {tryParse(msg.fail_reasons).slice(0, 5).map((r, j) => <div key={j} style={{ color: '#dc2626', fontSize: 11 }}>⚠️ {r}</div>)}
                      </div>
                    )}

                    {coaching?.suggested_reply && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 9px', marginTop: 4 }}>
                        <div style={{ fontSize: 9, color: '#16a34a', fontWeight: 800 }}>✅ ตัวอย่างที่ดีกว่า</div>
                        <div style={{ fontSize: 11, color: '#166534' }}>{String(coaching.suggested_reply).slice(0, 220)}</div>
                      </div>
                    )}

                    {/* Dispute */}
                    {msg.dispute_status ? (
                      <div style={{ marginTop: 8, fontSize: 11 }}>⚖️ โต้แย้งแล้ว: <span style={{ fontWeight: 700, color: msg.dispute_status === 'approved' ? '#16a34a' : msg.dispute_status === 'rejected' ? '#dc2626' : '#f59e0b' }}>{msg.dispute_status}</span></div>
                    ) : msg.qc_score_id && (disputeFor === msg.qc_score_id ? (
                      <div style={{ marginTop: 8, borderTop: '1px dashed #ddd', paddingTop: 8 }}>
                        <textarea value={disputeReason} onChange={e => setDisputeReason(e.target.value)} placeholder="เหตุผลที่โต้แย้งผล AI..." rows={2} style={{ width: '100%', fontSize: 12, padding: 6, borderRadius: 6, border: '1px solid #ddd' }} />
                        {disputeMsg && <div style={{ fontSize: 11, color: disputeMsg[0] === '⚠' ? '#dc2626' : '#16a34a' }}>{disputeMsg}</div>}
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <button onClick={() => submitDispute(msg.qc_score_id)} style={{ background: '#f59e0b', color: '#fff', border: 0, borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>ส่งโต้แย้ง</button>
                          <button onClick={() => { setDisputeFor(null); setDisputeMsg(''); }} style={{ background: '#e5e7eb', border: 0, borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>ยกเลิก</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setDisputeFor(msg.qc_score_id); setDisputeReason(''); setDisputeMsg(''); }} style={{ marginTop: 8, background: 'transparent', color: '#f59e0b', border: '1px solid #f59e0b', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>⚖️ โต้แย้งผล AI</button>
                    ))}
                  </div>
                  );
                })()}
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

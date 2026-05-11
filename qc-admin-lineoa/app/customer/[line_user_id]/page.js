'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ChatModal from '@/app/components/ChatModal';

function fmtSec(s) {
  s = Number(s || 0);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return `${s}s ที่แล้ว`;
  if (s < 3600) return `${Math.floor(s / 60)}m ที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ที่แล้ว`;
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function scoreColor(v) { return v >= 85 ? '#22c55e' : v >= 70 ? '#f59e0b' : '#ef4444'; }

const statusLabel = { unknown: '❓ ไม่ทราบ', pass: '✅ ผ่าน', fail: '❌ ไม่ผ่าน', pending: '⏳ รอดำเนินการ' };
const eventIcon = { register: '📝', kyc: '🪪', deposit: '💰', withdrawal: '💸' };

export default function CustomerProfile() {
  const params = useParams();
  const line_user_id = params?.line_user_id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chatUser, setChatUser] = useState(null);
  const [expandConv, setExpandConv] = useState(null);

  useEffect(() => {
    if (!line_user_id) return;
    setLoading(true);
    fetch(`/api/customer/${line_user_id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [line_user_id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>กำลังโหลด...</div>;
  if (error) return <div style={{ padding: 40, color: '#ef4444' }}>เกิดข้อผิดพลาด: {error}</div>;

  const { customer, events, conversations, stats } = data || {};
  const name = customer?.display_name || line_user_id;

  const regEvent  = events?.find(e => e.event_type === 'register' && e.status === 'pass');
  const kycEvent  = events?.find(e => e.event_type === 'kyc' && e.status === 'pass');
  const deposits  = events?.filter(e => e.event_type === 'deposit') || [];
  const totalDep  = deposits.reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: 24, maxWidth: 1100, margin: '0 auto' }}>

      {/* Back + Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <a href="/" style={{ color: '#6b7280', textDecoration: 'none', fontSize: 20 }}>←</a>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>👤 {name}</h1>
        <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'monospace' }}>{line_user_id}</span>
        <button
          onClick={() => setChatUser({ line_user_id, name })}
          style={{ marginLeft: 'auto', padding: '6px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          💬 ดูแชท
        </button>
      </div>

      {/* Status badges */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <span style={{ background: regEvent ? '#dcfce7' : '#f1f5f9', color: regEvent ? '#166534' : '#6b7280', padding: '4px 14px', borderRadius: 20, fontSize: 13 }}>
          📝 สมัคร: {regEvent ? statusLabel.pass : statusLabel.unknown}
        </span>
        <span style={{ background: kycEvent ? '#dcfce7' : '#f1f5f9', color: kycEvent ? '#166534' : '#6b7280', padding: '4px 14px', borderRadius: 20, fontSize: 13 }}>
          🪪 KYC: {kycEvent ? statusLabel.pass : statusLabel.unknown}
        </span>
        <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 14px', borderRadius: 20, fontSize: 13 }}>
          💰 เติมรวม: {totalDep.toLocaleString()} บาท
        </span>
        {customer?.first_seen_at && (
          <span style={{ background: '#f1f5f9', color: '#6b7280', padding: '4px 14px', borderRadius: 20, fontSize: 13 }}>
            🕒 พบครั้งแรก: {timeAgo(customer.first_seen_at)}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Conversations', value: conversations?.length || 0, icon: '💬' },
          { label: 'ข้อความ QC ทั้งหมด', value: stats?.total_scores || 0, icon: '📊' },
          { label: 'QC Score เฉลี่ย', value: stats?.avg_score ? `${stats.avg_score}` : '—', icon: '⭐', color: stats?.avg_score ? scoreColor(stats.avg_score) : undefined },
          { label: 'เวลาตอบเฉลี่ย', value: stats?.avg_response_sec ? fmtSec(stats.avg_response_sec) : '—', icon: '⏱️' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 22 }}>{s.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color || '#111827', marginTop: 4 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Events timeline */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>📅 Event Timeline</h2>
          {(!events || events.length === 0) ? (
            <div style={{ color: '#9ca3af', fontSize: 14 }}>ยังไม่มี events</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {events.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{eventIcon[e.event_type] || '📌'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {e.event_type}{e.status ? ` — ${statusLabel[e.status] || e.status}` : ''}
                    </div>
                    {e.amount && <div style={{ color: '#2563eb', fontSize: 13 }}>฿ {Number(e.amount).toLocaleString()}</div>}
                    <div style={{ color: '#9ca3af', fontSize: 11 }}>{fmtDate(e.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conversations */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>💬 Conversations ({conversations?.length || 0})</h2>
          {(!conversations || conversations.length === 0) ? (
            <div style={{ color: '#9ca3af', fontSize: 14 }}>ยังไม่มี conversation</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
              {conversations.map((c, i) => (
                <div key={i}
                  onClick={() => setExpandConv(expandConv === c.id ? null : c.id)}
                  style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', background: expandConv === c.id ? '#f0f9ff' : '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ background: c.status === 'open' ? '#dcfce7' : '#f1f5f9', color: c.status === 'open' ? '#166534' : '#6b7280', fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                        {c.status === 'open' ? '🟢 open' : '⚫ closed'}
                      </span>
                      <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>{c.admin_name || '—'}</span>
                    </div>
                    {c.avg_score > 0 && (
                      <span style={{ fontWeight: 700, color: scoreColor(c.avg_score), fontSize: 14 }}>{c.avg_score}</span>
                    )}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                    {fmtDate(c.opened_at)}
                    {c.closed_at && <> – {fmtDate(c.closed_at)}</>}
                  </div>
                  {expandConv === c.id && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 16, fontSize: 13 }}>
                      <span>👤 ลูกค้า: {c.cust_msgs} ข้อความ</span>
                      <span>💬 Admin: {c.admin_msgs} ข้อความ</span>
                      <span style={{ color: '#22c55e' }}>✅ {c.good}</span>
                      <span style={{ color: '#f59e0b' }}>⚠️ {c.warn}</span>
                      <span style={{ color: '#ef4444' }}>❌ {c.bad}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {chatUser && <ChatModal user={chatUser} onClose={() => setChatUser(null)} />}
    </div>
  );
}

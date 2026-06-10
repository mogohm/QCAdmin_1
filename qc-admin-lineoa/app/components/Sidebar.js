'use client';
import { useEffect, useState } from 'react';

const MENU = [
  ['/', '📊 Executive Dashboard'],
  ['/qc-dashboard', '🎯 QC Monitoring'],
  ['/chat-review', '💬 Chat Review'],
  ['/sop', '📚 SOP Knowledge Base'],
  ['/disputes', '⚖️ Disputes'],
  ['/system-events', '🛠️ System Events'],
  ['/admin-performance', '🏅 Admin Performance'],
  ['/commission', '💰 Commission'],
  ['/rules', '⚙️ Settings'],
];

export default function Sidebar({ active }) {
  const [me, setMe] = useState(null);
  useEffect(() => { fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(setMe).catch(() => {}); }, []);
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; };

  return (
    <aside className="side">
      <div className="brand">QC<span>Admin</span></div>
      <nav className="nav">
        {MENU.map(([href, label]) => (
          <a key={href} href={href} className={active === href ? 'active' : ''}>{label}</a>
        ))}
      </nav>
      <div style={{ marginTop: 'auto', paddingTop: 16, fontSize: 12, color: '#9fb3d6' }}>
        {me?.authenticated ? (
          <>
            <div style={{ marginBottom: 6 }}>👤 {me.name} <span style={{ background: 'rgba(255,255,255,.12)', borderRadius: 6, padding: '1px 7px', fontSize: 10 }}>{me.role}</span></div>
            <button onClick={logout} style={{ background: 'rgba(255,255,255,.12)', fontSize: 12, padding: '6px 12px' }}>ออกจากระบบ</button>
          </>
        ) : (
          <a href="/login" style={{ display: 'inline-block', background: 'rgba(255,255,255,.12)', borderRadius: 10, padding: '8px 14px', color: '#fff', textDecoration: 'none' }}>เข้าสู่ระบบ</a>
        )}
      </div>
    </aside>
  );
}

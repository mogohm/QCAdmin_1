'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const MENU = [
  ['/', '📊', 'Executive Dashboard'],
  ['/qc-dashboard', '🎯', 'QC Monitoring'],
  ['/chat-review', '💬', 'Chat Review'],
  ['/sop', '📚', 'SOP Knowledge Base'],
  ['/disputes', '⚖️', 'Disputes'],
  ['/system-events', '🛠️', 'System Events'],
  ['/admin-performance', '🏅', 'Admin Performance'],
  ['/commission', '💰', 'Commission'],
  ['/rules', '⚙️', 'Settings'],
];

export default function AppShell({ title, subtitle, actions, children }) {
  const pathname = usePathname();
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(setMe).catch(() => {}); }, []);
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; };
  const active = (href) => href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <div className="shell">
      <aside className="side" data-open={open}>
        <div className="brand">QC<span>Admin</span></div>
        <nav className="nav">
          {MENU.map(([href, icon, label]) => (
            <a key={href} href={href} className={active(href) ? 'active' : ''} onClick={() => setOpen(false)}>
              <span style={{ marginRight: 8 }}>{icon}</span>{label}
            </a>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: 16, fontSize: 12, color: '#9fb3d6' }}>
          {me?.authenticated ? (
            <>
              <div style={{ marginBottom: 8 }}>👤 {me.name} <span style={{ background: 'rgba(255,255,255,.12)', borderRadius: 6, padding: '1px 7px', fontSize: 10 }}>{me.role}</span></div>
              <button onClick={logout} style={{ background: 'rgba(255,255,255,.12)', fontSize: 12, padding: '6px 12px' }}>ออกจากระบบ</button>
            </>
          ) : <a href="/login" style={{ display: 'inline-block', background: 'rgba(255,255,255,.12)', borderRadius: 10, padding: '8px 14px', color: '#fff', textDecoration: 'none' }}>เข้าสู่ระบบ</a>}
        </div>
      </aside>

      <main className="main">
        <div className="top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="burger" onClick={() => setOpen(v => !v)} style={{ display: 'none' }}>☰</button>
            <div>
              <h2 style={{ margin: 0 }}>{title}</h2>
              {subtitle && <div className="muted" style={{ fontSize: 12 }}>{subtitle}</div>}
            </div>
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
        </div>
        {children}
      </main>

      <style>{`
        @media(max-width:1000px){
          .side{position:fixed;left:0;top:0;bottom:0;width:250px;transform:translateX(-100%);transition:.2s;z-index:900}
          .side[data-open="true"]{transform:translateX(0)}
          .burger{display:inline-block!important;background:#101b2d;color:#fff;border:0;border-radius:8px;padding:6px 12px;font-size:16px;cursor:pointer}
        }
      `}</style>
    </div>
  );
}

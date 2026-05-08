'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function fmtCountdown(ms) {
  if (ms <= 0) return '0:00';
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function ScraperStatusFloat() {
  const [state, setState] = useState(null); // null | { mode, label, countdown, chatName, pct }
  const router = useRouter();

  useEffect(() => {
    const poll = async () => {
      let cfg = null;
      try { cfg = JSON.parse(localStorage.getItem('qc_schedule') || 'null'); } catch {}

      let activeJob = null;
      try {
        const r = await fetch('/api/scraper/job');
        const jobs = await r.json();
        if (Array.isArray(jobs)) activeJob = jobs.find(j => j.status === 'running' || j.status === 'pending');
      } catch {}

      if (activeJob?.status === 'running') {
        const pct = activeJob.total_chats > 0
          ? Math.round((activeJob.logged_count / activeJob.total_chats) * 100)
          : null;
        setState({
          mode: 'running',
          label: `🔄 Scraping${pct !== null ? ` ${pct}%` : '...'}`,
          sub: activeJob.current_chat ? `กำลังดึง: ${activeJob.current_chat}` : null,
          pct,
        });
      } else if (activeJob?.status === 'pending') {
        setState({ mode: 'pending', label: '⏳ รอ scraper รับงาน', sub: null, pct: null });
      } else if (cfg?.on) {
        const remaining = cfg.nextRun ? Math.max(0, cfg.nextRun - Date.now()) : 0;
        setState({
          mode: 'scheduled',
          label: `⏰ Auto ON — รันใน ${fmtCountdown(remaining)}`,
          sub: `ทุก ${cfg.intervalMin} นาที`,
          pct: null,
        });
      } else {
        setState(null);
      }
    };

    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, []);

  if (!state) return null;

  const bg = state.mode === 'running' ? '#2196f3'
           : state.mode === 'pending' ? '#f59e0b'
           : '#22c55e';

  return (
    <div
      onClick={() => router.push('/scraper')}
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        background: bg, color: '#fff',
        borderRadius: 14, padding: '10px 18px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        cursor: 'pointer', minWidth: 180,
        transition: 'opacity 0.3s',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{state.label}</div>
      {state.sub && <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{state.sub}</div>}
      {state.pct !== null && (
        <div style={{ marginTop: 6, background: 'rgba(255,255,255,0.3)', borderRadius: 4, height: 4 }}>
          <div style={{ background: '#fff', borderRadius: 4, height: 4, width: `${state.pct}%`, transition: 'width 0.5s' }} />
        </div>
      )}
      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, textAlign: 'right' }}>คลิกเพื่อดูรายละเอียด</div>
    </div>
  );
}

'use client';
import { useEffect } from 'react';

// รันใน layout — ทำงานทุกหน้า ไม่หายเมื่อ navigate
export default function ScraperGlobalScheduler() {
  useEffect(() => {
    const tick = async () => {
      let cfg;
      try { cfg = JSON.parse(localStorage.getItem('qc_schedule') || 'null'); } catch { return; }
      if (!cfg?.on || !cfg.key || !cfg.nextRun) return;
      if (Date.now() < cfg.nextRun) return;

      // ถึงเวลาสร้าง job
      const today = new Date().toISOString().slice(0, 10);
      try {
        await fetch('/api/scraper/job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key },
          body: JSON.stringify({ date_from: today, date_to: today }),
        });
      } catch {}

      // update nextRun
      cfg.nextRun = Date.now() + cfg.intervalMs;
      localStorage.setItem('qc_schedule', JSON.stringify(cfg));
    };

    // ตรวจทุก 15 วินาที
    const t = setInterval(tick, 15000);
    tick(); // run immediately
    return () => clearInterval(t);
  }, []);

  return null;
}

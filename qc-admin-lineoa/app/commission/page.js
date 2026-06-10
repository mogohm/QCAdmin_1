'use client';
import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';

const toISO = d => d.toISOString().slice(0, 10);
const sc = v => (v >= 85 ? 'good' : v >= 70 ? 'warn' : 'bad');
const TIERS = [['Excellent', '90-100', 1.2, '#16a34a'], ['Standard', '80-89', 1.0, '#0b5cab'], ['Warning', '70-79', 0.5, '#f59e0b'], ['Critical', '<70', 0, '#ef4444']];

export default function Commission() {
  const [d, setD] = useState(null);
  const [from, setFrom] = useState(toISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(toISO(new Date()));

  const load = () => fetch(`/api/dashboard?from=${from}&to=${to}`).then(r => r.json()).then(setD);
  useEffect(() => { load(); }, []);

  const per = d?.commissionSummary?.per_admin || [];
  const tiers = d?.commissionSummary?.tiers || {};
  const total = per.reduce((s, a) => s + (a.estimated_commission || 0), 0);

  return (
    <div className="shell">
      <Sidebar active="/commission" />
      <main className="main">
        <div className="top"><div><h2 style={{ margin: 0 }}>Commission</h2><div className="muted" style={{ fontSize: 12 }}>ประมาณการค่าคอม = ยอด Upsell × 1% × ตัวคูณ Tier</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 150, margin: 0 }} />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 150, margin: 0 }} />
            <button onClick={load}>ดู</button>
          </div>
        </div>

        {/* tier legend */}
        <section className="grid kpis" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 14 }}>
          {TIERS.map(([name, range, mult, color]) => (
            <div className="card" key={name}>
              <div className="kpi-title" style={{ color }}>{name} ({range})</div>
              <div className="kpi-value" style={{ fontSize: 22 }}>×{mult}</div>
              <div className="muted" style={{ fontSize: 11 }}>{tiers[name === 'Excellent' ? 'tier1' : name === 'Standard' ? 'tier2' : name === 'Warning' ? 'tier3' : 'tier4'] || 0} เคส</div>
            </div>
          ))}
        </section>

        <div className="card" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b>รวมค่าคอมประมาณการทั้งทีม</b>
          <span style={{ fontSize: 28, fontWeight: 900, color: '#16a34a' }}>฿{total.toLocaleString()}</span>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Admin</th><th>Avg Score</th><th>Tier</th><th>Multiplier</th><th>Upsell (฿)</th><th>Fatal Penalty</th><th>Est. Commission</th></tr></thead>
            <tbody>{[...per].sort((a, b) => b.estimated_commission - a.estimated_commission).map(a => (
              <tr key={a.admin_id}>
                <td style={{ fontWeight: 600 }}>{a.admin}</td>
                <td className={`score ${sc(a.avg_score)}`}>{a.avg_score}</td>
                <td><span className="badge" style={{ background: a.tier === 'Excellent' ? '#dcfce7' : a.tier === 'Standard' ? '#dbeafe' : a.tier === 'Warning' ? '#fef9c3' : '#fee2e2' }}>{a.tier}</span></td>
                <td>×{a.multiplier}</td>
                <td>{Number(a.upsell_amount || 0).toLocaleString()}</td>
                <td className="score bad">{a.fatal_penalty || 0}</td>
                <td style={{ fontWeight: 800, color: '#16a34a' }}>฿{Number(a.estimated_commission || 0).toLocaleString()}</td>
              </tr>))}
              {!per.length && <tr><td colSpan="7" className="muted" style={{ textAlign: 'center', padding: 20 }}>ยังไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>* ตัวคูณ Tier ตาม Excel: 90-100→1.2, 80-89→1.0, 70-79→0.5, &lt;70→0 · rate 1% ของยอดฝาก (ปรับได้ใน dashboard API)</div>
      </main>
    </div>
  );
}

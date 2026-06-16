'use client';
import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';

const toISO = d => d.toISOString().slice(0, 10);
const sc = v => (v >= 85 ? 'good' : v >= 70 ? 'warn' : 'bad');
const TIERS = [['Excellent', '90-100', 1.2, '#16a34a'], ['Standard', '80-89', 1.0, '#0b5cab'], ['Warning', '70-79', 0.5, '#f59e0b'], ['Critical', '<70', 0, '#ef4444']];

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = filename; a.click();
}

export default function Commission() {
  const [d, setD] = useState(null);
  const [from, setFrom] = useState(toISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(toISO(new Date()));
  const [override, setOverride] = useState({});

  useEffect(() => { try { setOverride(JSON.parse(localStorage.getItem('commission_override') || '{}')); } catch {} }, []);
  const load = () => fetch(`/api/dashboard?from=${from}&to=${to}`).then(r => r.json()).then(setD);
  useEffect(() => { load(); }, []);
  const setOv = (id, v) => { const n = { ...override, [id]: v }; if (v === '') delete n[id]; setOverride(n); localStorage.setItem('commission_override', JSON.stringify(n)); };

  const per = d?.commissionSummary?.per_admin || [];
  const tiers = d?.commissionSummary?.tiers || {};
  const finalOf = a => override[a.admin_id] !== undefined && override[a.admin_id] !== '' ? Number(override[a.admin_id]) : a.estimated_commission;
  const total = per.reduce((s, a) => s + (finalOf(a) || 0), 0);

  const exportCSV = () => downloadCSV(`commission_${from}_${to}.csv`,
    [['Admin', 'AvgScore', 'Tier', 'Multiplier', 'Upsell', 'FatalPenalty', 'DisputeAdj', 'Estimated', 'Override', 'Final'],
    ...per.map(a => [a.admin, a.avg_score, a.tier, a.multiplier, a.upsell_amount, a.fatal_penalty, a.dispute_adjustment, a.estimated_commission, override[a.admin_id] ?? '', finalOf(a)])]);

  const actions = (
    <>
      <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 150, margin: 0 }} />
      <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 150, margin: 0 }} />
      <button onClick={load}>ดู</button>
      <button onClick={exportCSV} style={{ background: '#16a34a' }}>⬇ CSV</button>
    </>
  );

  return (
    <AppShell title="Commission" subtitle="ประมาณการค่าคอม = ยอด Upsell × 1% × ตัวคูณ Tier" actions={actions}>
      <>
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
          <div><b>รวมค่าคอมประมาณการ (รวม override)</b><div className="muted" style={{ fontSize: 12 }}>ช่วง {from} → {to}</div></div>
          <span style={{ fontSize: 28, fontWeight: 900, color: '#16a34a' }}>฿{total.toLocaleString()}</span>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Admin</th><th>Score</th><th>Tier</th><th>×Mult</th><th>Upsell (฿)</th><th>Fatal</th><th>Dispute Adj</th><th>Estimated</th><th>Override (Manual)</th><th>Final</th></tr></thead>
            <tbody>{[...per].sort((a, b) => finalOf(b) - finalOf(a)).map(a => (
              <tr key={a.admin_id}>
                <td style={{ fontWeight: 600 }}>{a.admin}</td>
                <td className={`score ${sc(a.avg_score)}`}>{a.avg_score}</td>
                <td><span className="badge" style={{ background: a.tier === 'Excellent' ? '#dcfce7' : a.tier === 'Standard' ? '#dbeafe' : a.tier === 'Warning' ? '#fef9c3' : '#fee2e2' }}>{a.tier}</span></td>
                <td>×{a.multiplier}</td>
                <td>{Number(a.upsell_amount || 0).toLocaleString()}</td>
                <td className="score bad">{a.fatal_penalty || 0}</td>
                <td>{a.dispute_adjustment ? <span className="badge" style={{ background: '#dcfce7', color: '#16a34a' }}>{a.dispute_adjustment} แก้</span> : '—'}</td>
                <td>฿{Number(a.estimated_commission || 0).toLocaleString()}</td>
                <td><input type="number" placeholder="—" value={override[a.admin_id] ?? ''} onChange={e => setOv(a.admin_id, e.target.value)} style={{ width: 90, margin: 0, padding: 5 }} /></td>
                <td style={{ fontWeight: 800, color: '#16a34a' }}>฿{Number(finalOf(a) || 0).toLocaleString()}</td>
              </tr>))}
              {!per.length && <tr><td colSpan="10" className="muted" style={{ textAlign: 'center', padding: 20 }}>ยังไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          <b>Tier:</b> 90-100→×1.2 · 80-89→×1.0 · 70-79→×0.5 · &lt;70→×0 · <b>Fatal</b> = จำนวนเคส fatal (หักตามนโยบาย) · <b>Dispute Adj</b> = เคสที่ manager แก้คะแนนแล้ว · <b>Override</b> บันทึกในเครื่อง (manual)
        </div>
      </>
    </AppShell>
  );
}

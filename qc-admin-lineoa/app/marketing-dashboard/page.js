"use client";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import GlassPanel from "../components/GlassPanel";
import MetricTile from "../components/MetricTile";
import FunnelChart from "../components/FunnelChart";
import BarChart from "../components/BarChart";

const toISO = (d) => d.toISOString().slice(0, 10);
const baht = (n) => "฿" + Number(n || 0).toLocaleString();

export default function MarketingDashboard() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(
    toISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  );
  const [to, setTo] = useState(toISO(new Date()));
  const load = () => {
    setLoading(true);
    fetch(`/api/dashboard?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);
  const m = d?.marketingSummary || {};
  const hasData =
    (m.registration || 0) + (m.deposit_count || 0) + (m.kyc_total || 0) > 0;
  // partial-data warning: "เลข 0" ≠ "ไม่มีกิจกรรม" ถ้า scraper ยังเก็บช่วงนี้ไม่ครบ
  const cov = d?.scraperCoverage || null;
  const partial = cov?.checked === true && cov.complete === false;
  const actions = (
    <>
      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        style={{ width: 140, margin: 0 }}
      />
      <input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        style={{ width: 140, margin: 0 }}
      />
      <button onClick={load}>{loading ? "..." : "ดู"}</button>
    </>
  );
  return (
    <AppShell
      title="📣 แดชบอร์ดการตลาด"
      subtitle="การสมัครสมาชิก · KYC · ยอดฝาก/ถอน · โปรโมชั่น"
      actions={actions}
    >
      {loading && (
        <div className="loadbar">
          <span className="spin">⏳</span> กำลังโหลด...
        </div>
      )}
      {partial && (
        <div
          style={{
            background: "rgba(245,158,11,.12)", border: "1px solid #d97706", borderRadius: 10,
            padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#fbbf24", lineHeight: 1.7,
          }}
        >
          ⚠️ <b>ข้อมูลช่วงนี้อาจยังไม่ครบ</b> — scraper ยังไม่เก็บข้อมูลสำเร็จ {cov.days_missing} จาก {cov.days} วัน
          {cov.missing_dates?.length ? <> (ขาด: {cov.missing_dates.join(", ")}{cov.days_missing > cov.missing_dates.length ? " …" : ""})</> : null}
          {cov.active_job ? " · มีงานเก็บข้อมูลกำลังทำอยู่" : " · สั่งเก็บข้อมูลได้ที่หน้า /scraper"}
        </div>
      )}
      <div
        className="grid kpis"
        style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 14 }}
      >
        <MetricTile
          label="สมัครทั้งหมด"
          value={m.registration || 0}
          tone="blue"
        />
        <MetricTile label="KYC ผ่าน" value={m.kyc_pass || 0} tone="green" />
        <MetricTile
          label="ยอดฝากรวม"
          value={baht(m.deposit_total)}
          tone="gold"
          hint={`${m.deposit_count || 0} ครั้ง`}
        />
        <MetricTile
          label="ยอดถอนรวม"
          value={baht(m.withdraw_total)}
          tone="red"
          hint={`${m.withdraw_count || 0} ครั้ง`}
        />
      </div>
      <section className="grid split">
        <GlassPanel
          title="เส้นทางการสมัครสมาชิก"
          glow
          empty={!hasData && !loading && "ยังไม่มีข้อมูลในช่วงวันที่นี้"}
        >
          <FunnelChart
            steps={[
              { label: "สมัคร", value: m.registration || 0 },
              { label: "สมัครสำเร็จ", value: m.registration_pass || 0 },
              { label: "KYC ผ่าน", value: m.kyc_pass || 0 },
              {
                label: "ล้มเหลว",
                value: m.registration_fail || 0,
                color: "#ef4444",
              },
            ]}
          />
        </GlassPanel>
        <GlassPanel title="KYC และโปรโมชั่น" glow>
          <BarChart
            rows={[
              {
                label: "ผ่าน KYC",
                value: m.kyc_pass || 0,
                color: "linear-gradient(90deg,#22c55e,#38bdf8)",
              },
              { label: "KYC ทั้งหมด", value: m.kyc_total || 0 },
            ]}
          />
          <div
            className="grid"
            style={{ gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}
          >
            <MetricTile
              label="ผู้ร่วมโปร"
              value={m.promotion_participants || 0}
              tone="blue"
            />
            <MetricTile
              label="ยอดฝากจากโปร"
              value={baht(m.promotion_deposit)}
              tone="gold"
            />
          </div>
        </GlassPanel>
      </section>
    </AppShell>
  );
}

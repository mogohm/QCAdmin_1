"use client";
// MetricTile — การ์ด KPI เล็ก (เลข gold) + label + เทรนด์เล็ก
export default function MetricTile({ label, value, suffix = "", tone = "gold", hint }) {
  const colors = { gold: "var(--gold)", green: "var(--green)", red: "var(--red)", blue: "var(--blue)" };
  return (
    <div
      style={{
        background: "rgba(8,18,41,0.55)",
        border: "1px solid var(--border-soft)",
        borderRadius: 14,
        padding: "12px 14px",
      }}
    >
      <div className="kpi-title">{label}</div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 900,
          marginTop: 4,
          color: colors[tone] || colors.gold,
          textShadow: "0 0 16px rgba(246,198,91,.2)",
        }}
      >
        {value}
        {suffix}
      </div>
      {hint != null && (
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

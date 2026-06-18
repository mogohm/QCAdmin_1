"use client";
// KpiGauge — เกจครึ่งวงกลม (0-100) โทน gold/green/red + ค่าใหญ่ตรงกลาง
export default function KpiGauge({ value = 0, label, max = 100, suffix = "", size = 130 }) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  const pct = v / max;
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const circ = Math.PI * r; // ครึ่งวงกลม
  const color = v >= 85 ? "#22c55e" : v >= 70 ? "#f6c65b" : "#ef4444";
  const arc = (frac) => {
    const a = Math.PI * (1 - frac);
    return `${cx + r * Math.cos(Math.PI)} ${cy} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a)} ${cy - r * Math.sin(a)}`;
  };
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`}>
        <path d={`M ${arc(1)}`} fill="none" stroke="rgba(125,211,252,0.15)" strokeWidth="10" strokeLinecap="round" />
        <path
          d={`M ${arc(1)}`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ filter: `drop-shadow(0 0 6px ${color}88)`, transition: "stroke-dashoffset .6s" }}
        />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="26" fontWeight="900" fill={color}>
          {Math.round(v)}
          {suffix}
        </text>
      </svg>
      {label && (
        <div className="kpi-title" style={{ marginTop: -6 }}>
          {label}
        </div>
      )}
    </div>
  );
}

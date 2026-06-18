"use client";
// RadarChart — เรดาร์ทักษะ (pure SVG). axes=[{label,value(0-100)}]
export default function RadarChart({ axes = [], size = 240, color = "#38bdf8" }) {
  if (!axes.length) return <div className="empty">ยังไม่มีข้อมูลรายมิติ</div>;
  const cx = size / 2,
    cy = size / 2,
    R = size / 2 - 34;
  const n = axes.length;
  const pt = (i, frac) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + R * frac * Math.cos(a), cy + R * frac * Math.sin(a)];
  };
  const rings = [0.25, 0.5, 0.75, 1];
  const poly = axes
    .map((ax, i) => pt(i, Math.max(0, Math.min(1, (Number(ax.value) || 0) / 100))))
    .map((p) => p.join(","))
    .join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxHeight: size }}>
      {rings.map((rf, k) => (
        <polygon
          key={k}
          points={axes.map((_, i) => pt(i, rf).join(",")).join(" ")}
          fill="none"
          stroke="rgba(125,211,252,0.14)"
        />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(125,211,252,0.12)" />;
      })}
      <polygon
        points={poly}
        fill={`${color}33`}
        stroke={color}
        strokeWidth="2"
        style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
      />
      {axes.map((ax, i) => {
        const [x, y] = pt(i, 1.18);
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#b6c4df">
            {ax.label}
          </text>
        );
      })}
    </svg>
  );
}

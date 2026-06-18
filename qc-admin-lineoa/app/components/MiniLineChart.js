"use client";
// MiniLineChart — เส้นเทรนด์ (pure SVG). data=[{label,value}]
export default function MiniLineChart({ data = [], height = 150, color = "#38bdf8", max = 100 }) {
  const pts = data.filter((d) => d.value != null);
  if (pts.length < 2) return <div className="empty">ข้อมูลไม่พอวาดกราฟ</div>;
  const W = 560,
    H = height,
    pad = 26;
  const xs = pts.map((_, i) => pad + (i * (W - 2 * pad)) / (pts.length - 1));
  const ys = pts.map((d) => H - pad - (Math.min(max, d.value) / max) * (H - 2 * pad));
  const path = xs.map((x, i) => `${i ? "L" : "M"}${x},${ys[i]}`).join(" ");
  const area = `${path} L${xs[xs.length - 1]},${H - pad} L${xs[0]},${H - pad} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id="mlc" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((g) => {
        const y = H - pad - (g / 100) * (H - 2 * pad);
        return (
          <g key={g}>
            <line x1={pad} y1={y} x2={W - pad} y2={y} stroke="rgba(125,211,252,0.1)" />
            <text x={4} y={y + 3} fontSize="9" fill="#6f82a8">
              {g}
            </text>
          </g>
        );
      })}
      <path d={area} fill="url(#mlc)" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        style={{ filter: `drop-shadow(0 0 5px ${color}77)` }}
      />
      {xs.map((x, i) => (
        <circle
          key={i}
          cx={x}
          cy={ys[i]}
          r="3"
          fill={pts[i].value >= 85 ? "#22c55e" : pts[i].value >= 70 ? "#f6c65b" : "#ef4444"}
        />
      ))}
    </svg>
  );
}

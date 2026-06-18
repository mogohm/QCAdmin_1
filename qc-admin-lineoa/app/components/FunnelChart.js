"use client";
// FunnelChart — กรวย conversion. steps=[{label,value,color?}]
export default function FunnelChart({ steps = [] }) {
  if (!steps.length || steps.every((s) => !s.value)) return <div className="empty">ยังไม่มีข้อมูลในช่วงวันที่นี้</div>;
  const mx = Math.max(1, ...steps.map((s) => Number(s.value) || 0));
  const palette = ["#38bdf8", "#22c55e", "#f6c65b", "#ef4444"];
  return (
    <div>
      {steps.map((s, i) => {
        const w = 40 + ((Number(s.value) || 0) / mx) * 60;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, margin: "7px 0" }}>
            <div style={{ width: 120, fontSize: 12 }} className="muted">
              {s.label}
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  width: w + "%",
                  margin: "0 auto",
                  background: `linear-gradient(90deg, ${s.color || palette[i % 4]}, ${s.color || palette[i % 4]}66)`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontWeight: 800,
                  color: "#08142e",
                  textAlign: "center",
                  boxShadow: "0 0 12px rgba(56,189,248,.25)",
                }}
              >
                {Number(s.value).toLocaleString()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

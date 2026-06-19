"use client";
// BarChart — แท่งแนวนอน (default) หรือแนวตั้ง. rows=[{label,value,color?}]
export default function BarChart({
  rows = [],
  horizontal = true,
  unit = "",
  height = 18,
}) {
  if (!rows.length) return <div className="empty">ยังไม่มีข้อมูล</div>;
  const mx = Math.max(1, ...rows.map((r) => Number(r.value) || 0));
  if (horizontal) {
    return (
      <div>
        {rows.map((r, i) => (
          <div key={i} style={{ margin: "8px 0" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                marginBottom: 3,
              }}
            >
              <span className="muted">{r.label}</span>
              <b style={{ color: "#dbe7ff" }}>
                {r.value}
                {unit}
              </b>
            </div>
            <div
              style={{
                background: "rgba(125,211,252,0.1)",
                borderRadius: 6,
                height,
              }}
            >
              <div
                style={{
                  width: ((Number(r.value) || 0) / mx) * 100 + "%",
                  height,
                  borderRadius: 6,
                  background:
                    r.color || "linear-gradient(90deg,#1f6feb,#38bdf8)",
                  boxShadow: "0 0 10px rgba(56,189,248,.4)",
                  transition: "width .5s",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }
  // vertical
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 10,
        height: 140,
        paddingTop: 10,
      }}
    >
      {rows.map((r, i) => (
        <div key={i} style={{ flex: 1, textAlign: "center" }}>
          <div
            style={{
              height: ((Number(r.value) || 0) / mx) * 110 + "px",
              background: r.color || "linear-gradient(180deg,#38bdf8,#1f6feb)",
              borderRadius: "6px 6px 0 0",
              boxShadow: "0 0 10px rgba(56,189,248,.4)",
            }}
          />
          <div
            style={{
              fontSize: 11,
              marginTop: 4,
              color: "#dbe7ff",
              fontWeight: 700,
            }}
          >
            {r.value}
          </div>
          <div className="muted" style={{ fontSize: 10 }}>
            {r.label}
          </div>
        </div>
      ))}
    </div>
  );
}

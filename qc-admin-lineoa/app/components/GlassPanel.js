"use client";
// GlassPanel — กล่อง glass + หัวข้อ + สถานะ loading/empty
export default function GlassPanel({ title, tag, glow, actions, loading, empty, children, style }) {
  return (
    <div className={`glass ${glow ? "glow" : ""}`} style={style}>
      {(title || actions) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="panel-title" style={{ margin: 0 }}>
            {title}
            {tag && <span className="tag">{tag}</span>}
          </div>
          {actions}
        </div>
      )}
      {loading ? (
        <div className="empty">
          <span className="spin">⏳</span> กำลังโหลด...
        </div>
      ) : empty ? (
        <div className="empty">{typeof empty === "string" ? empty : "ยังไม่มีข้อมูลในช่วงวันที่นี้"}</div>
      ) : (
        children
      )}
    </div>
  );
}

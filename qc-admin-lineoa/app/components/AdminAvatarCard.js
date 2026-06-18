"use client";
// AdminAvatarCard — การ์ดโปรไฟล์แอดมิน (avatar วงกลม initial + ชื่อ + tier)
const sc = (v) => (v >= 85 ? "good" : v >= 70 ? "warn" : "bad");
export default function AdminAvatarCard({ name = "—", score, cases, tier }) {
  const initial =
    (name || "?")
      .replace(/^PK\s*[-·]?\s*/i, "")
      .trim()
      .slice(0, 2) || "PK";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontWeight: 900,
          fontSize: 18,
          color: "#08142e",
          background: "linear-gradient(135deg,#ffe082,#f6c65b)",
          boxShadow: "0 0 18px rgba(246,198,91,.45)",
        }}
      >
        {initial.toUpperCase()}
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 16, color: "#f1f6ff" }}>{name}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
          {score != null && (
            <span className={`score ${sc(score)}`} style={{ fontSize: 18 }}>
              {score}
            </span>
          )}
          {tier && <span className="badge">{tier}</span>}
          {cases != null && (
            <span className="muted" style={{ fontSize: 12 }}>
              {cases} เคส
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

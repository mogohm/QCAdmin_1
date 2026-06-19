"use client";
// LeaderboardTable — อันดับแอดมิน + เหรียญ 1/2/3
const sc = (v) => (v >= 85 ? "good" : v >= 70 ? "warn" : "bad");
const fmtSec = (s) => {
  s = Number(s || 0);
  return s <= 0 ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
};
export default function LeaderboardTable({ rows = [], onPick }) {
  if (!rows.length)
    return <div className="empty">ยังไม่มีข้อมูลในช่วงวันที่นี้</div>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>#</th>
          <th>Admin</th>
          <th>QA Score</th>
          <th>เคส</th>
          <th>ตอบเฉลี่ย</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a, i) => (
          <tr
            key={a.id || i}
            onClick={() => onPick && onPick(a)}
            style={{ cursor: onPick ? "pointer" : "default" }}
          >
            <td>
              {i < 3 ? (
                <span className={`medal ${["g", "s", "b"][i]}`}>{i + 1}</span>
              ) : (
                <span className="muted">{i + 1}</span>
              )}
            </td>
            <td style={{ fontWeight: 700, color: "#e7eefc" }}>
              {a.member_name || a.admin || "—"}
            </td>
            <td className={`score ${sc(a.avg_score)}`}>{a.avg_score ?? "—"}</td>
            <td>{a.cases ?? 0}</td>
            <td className="muted">{fmtSec(a.avg_response_sec)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

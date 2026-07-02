"use client";
import { useEffect, useState } from "react";
import { ScoringCriteriaButton } from "../components/ScoringCriteriaPanel";

const toISO = (d) => d.toISOString().slice(0, 10);
const weekAgo = () => toISO(new Date(Date.now() - 7 * 864e5));
const today = () => toISO(new Date());
const sc = (v) =>
  v >= 90 ? "#22d39a" : v >= 80 ? "#5fd0ff" : v >= 70 ? "#f5b341" : "#ff6b6b";
const fmtSec = (s) =>
  s == null ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;

const RADAR_AXES = [
  ["greeting_closing", "Greeting/Closing"],
  ["problem_solving", "Problem Solving"],
  ["communication_tone", "Tone"],
  ["response_time", "Response"],
  ["credit_deposit_withdraw", "Deposit/WD"],
  ["kyc_process", "KYC"],
  ["upsell_promotion", "Upsell"],
];
const TIERS = [
  ["tier1", "Tier 1 · Excellent (90-100)", "#22d39a"],
  ["tier2", "Tier 2 · Standard (80-89)", "#5fd0ff"],
  ["tier3", "Tier 3 · Warning (70-79)", "#f5b341"],
  ["tier4", "Tier 4 · Critical (<70)", "#ff6b6b"],
];

// ----- styled atoms (dark) -----
const card = {
  background: "linear-gradient(160deg,#13243f,#0e1b30)",
  border: "1px solid #21406e",
  borderRadius: 16,
  padding: 16,
  color: "#dbe7fb",
};
const title = {
  fontSize: 13,
  fontWeight: 800,
  color: "#8fb0e0",
  margin: "0 0 12px",
  letterSpacing: 0.3,
};

function Gauge({ label, value, sub }) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div
        style={{
          fontSize: 26,
          fontWeight: 900,
          color: sub === "score" ? sc(value) : "#eaf2ff",
        }}
      >
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 11, color: "#7d92b5", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function Radar({ data }) {
  const size = 230,
    cx = size / 2,
    cy = size / 2,
    R = 78,
    n = RADAR_AXES.length;
  const pt = (i, r) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = RADAR_AXES.map(([k], i) =>
    pt(i, R * ((data?.[k] ?? 0) / 100)).join(","),
  ).join(" ");
  return (
    <svg width={size} height={size} style={{ overflow: "visible" }}>
      {[0.25, 0.5, 0.75, 1].map((f, gi) => (
        <polygon
          key={gi}
          points={RADAR_AXES.map((_, i) => pt(i, R * f).join(",")).join(" ")}
          fill="none"
          stroke="#223a5a"
        />
      ))}
      {RADAR_AXES.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#1c3354" />;
      })}
      <polygon
        points={poly}
        fill="rgba(95,208,255,.25)"
        stroke="#5fd0ff"
        strokeWidth="2"
      />
      {RADAR_AXES.map(([k, label], i) => {
        const [x, y] = pt(i, R + 16);
        return (
          <text
            key={k}
            x={x}
            y={y}
            fontSize="9"
            fill="#7d92b5"
            textAnchor="middle"
          >
            {label}
            <tspan x={x} dy="11" fontWeight="800" fill="#eaf2ff">
              {data?.[k] ?? "—"}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

function Trend({ data }) {
  if (!data?.length)
    return <div style={{ color: "#7d92b5", fontSize: 12 }}>ไม่มีข้อมูล</div>;
  const W = 460,
    H = 130,
    pad = 24;
  const xs = data.map(
    (_, i) => pad + (i * (W - 2 * pad)) / Math.max(1, data.length - 1),
  );
  const ys = data.map(
    (d) => H - pad - ((d.avg_score || 0) / 100) * (H - 2 * pad),
  );
  const path = xs.map((x, i) => `${i ? "L" : "M"}${x},${ys[i]}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {[0, 50, 100].map((g) => {
        const y = H - pad - (g / 100) * (H - 2 * pad);
        return (
          <g key={g}>
            <line x1={pad} y1={y} x2={W - pad} y2={y} stroke="#1c3354" />
            <text x={2} y={y + 3} fontSize="8" fill="#5b6f93">
              {g}
            </text>
          </g>
        );
      })}
      <path d={path} fill="none" stroke="#5fd0ff" strokeWidth="2.5" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r="3" fill={sc(data[i].avg_score)} />
      ))}
    </svg>
  );
}

function Bars({ rows, max, color }) {
  const m = max || Math.max(1, ...rows.map((r) => r.v));
  return rows.map((r) => (
    <div key={r.label} style={{ margin: "7px 0" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          marginBottom: 3,
        }}
      >
        <span>{r.label}</span>
        <b>{r.v}</b>
      </div>
      <div style={{ background: "#0e1c33", borderRadius: 6, height: 9 }}>
        <div
          style={{
            width: (r.v / m) * 100 + "%",
            height: 9,
            borderRadius: 6,
            background: r.color || color || "#5fd0ff",
          }}
        />
      </div>
    </div>
  ));
}

export default function QCDashboard() {
  const [me, setMe] = useState(undefined); // undefined=loading, null=not auth
  const [d, setD] = useState(null);
  const [from, setFrom] = useState(weekAgo());
  const [to, setTo] = useState(today());
  const [tab, setTab] = useState("admin");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.authenticated) {
          window.location.href = "/login";
          return;
        }
        setMe(j);
        setTab(
          j.role === "admin"
            ? "admin"
            : j.role === "marketing"
              ? "marketing"
              : "manager",
        );
        load();
      })
      .catch(() => {
        window.location.href = "/login";
      });
  }, []);

  const load = (f = from, t = to) => {
    setLoading(true);
    fetch(`/api/qc/insights?from=${f}&to=${t}`)
      .then((r) => r.json())
      .then(setD)
      .finally(() => setLoading(false));
  };
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  if (me === undefined)
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0a1424",
          color: "#5fd0ff",
        }}
      >
        กำลังโหลด...
      </div>
    );

  const role = me.role;
  const tabs =
    role === "admin"
      ? [
          ["admin", "👤 ของฉัน"],
          ["leaderboard", "🏆 อันดับ"],
          ["coaching", "🎓 Coaching"],
        ]
      : role === "marketing"
        ? [["marketing", "📣 Marketing"]]
        : [
            ["manager", "🧭 Manager"],
            ["leaderboard", "🏆 Leaderboard"],
            ["marketing", "📣 Marketing"],
            ["coaching", "🎓 Coaching"],
          ];

  const radar = d?.skill_radar || {};
  const cm = d?.commission_distribution || {};
  const tot = d?.totals || {};
  const myRank = (d?.admin_ranking || []).find(
    (a) => a.admin_id === me.adminId,
  );
  const commission =
    role === "admin"
      ? tot.avg_score >= 90
        ? 100
        : tot.avg_score >= 80
          ? 70
          : tot.avg_score >= 70
            ? 40
            : 0
      : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 500px at 70% -10%,#16315c,#0a1424 55%)",
        fontFamily: "Inter,'Noto Sans Thai',sans-serif",
        color: "#dbe7fb",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 26px",
          borderBottom: "1px solid #1c3354",
        }}
      >
        <div>
          {/* breadcrumb + back */}
          <div
            style={{
              fontSize: 12,
              color: "#8fb0dd",
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <a href="/" style={{ color: "#5fd0ff", textDecoration: "none" }}>
              ← กลับ Dashboard
            </a>
            <span style={{ color: "#3a557d" }}>|</span>
            <span className="muted">หน้าหลัก / QC Monitoring</span>
          </div>
          <div style={{ fontSize: 11, color: "#5fd0ff", letterSpacing: 2 }}>
            AI QC PROGRAM · QC MONITORING
          </div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>
            ตรวจสอบคุณภาพการตอบแบบเรียลไทม์
          </div>
          <div style={{ fontSize: 12, color: "#8fb0dd", marginTop: 2 }}>
            เฝ้าดูคะแนน QC ทีมงาน · เคสผิดพลาด (Fatal/Minor) · เวลาตอบ ·
            เคสที่ต้องตรวจสอบ
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={dateInp}
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={dateInp}
          />
          <button onClick={() => load()} style={btn}>
            {loading ? "..." : "ดู"}
          </button>
          <ScoringCriteriaButton />
          <div
            style={{
              fontSize: 12,
              color: "#9fb3d6",
              borderLeft: "1px solid #2a456f",
              paddingLeft: 10,
            }}
          >
            {me.name}{" "}
            <span
              style={{
                background: "#1c3a66",
                borderRadius: 6,
                padding: "2px 7px",
                fontSize: 10,
                marginLeft: 4,
              }}
            >
              {role}
            </span>
          </div>
          <button onClick={logout} style={{ ...btn, background: "#2a3b57" }}>
            ออก
          </button>
        </div>
      </div>

      <div style={{ padding: 22 }}>
        {/* tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {tabs.map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                ...btn,
                background:
                  tab === k
                    ? "linear-gradient(135deg,#0b5cab,#09a8d8)"
                    : "#13243f",
                color: tab === k ? "#fff" : "#8fb0e0",
                border: "1px solid #21406e",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {d?.error && (
          <div style={{ ...card, color: "#ff8585" }}>
            ⚠️ {d.error}
            <div style={{ color: "#7d92b5" }}>{d.hint}</div>
          </div>
        )}

        {/* ADMIN (3.1) — ของตัวเอง */}
        {tab === "admin" && (
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            <div style={card}>
              <p style={title}>ภาพรวมผลงาน · {me.name}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <Gauge
                  label="คะแนนเฉลี่ย QA"
                  value={tot.avg_score}
                  sub="score"
                />
                <Gauge label="ตรวจทั้งหมด" value={tot.total} />
                <Gauge
                  label="เวลาตอบเฉลี่ย"
                  value={fmtSec(tot.avg_response_sec)}
                />
              </div>
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 12,
                  background: "linear-gradient(135deg,#0d2f25,#0e1b30)",
                  border: "1px solid #1d5c43",
                }}
              >
                <div style={{ fontSize: 12, color: "#8fb0e0" }}>
                  Estimated Commission
                </div>
                <div
                  style={{ fontSize: 34, fontWeight: 900, color: "#22d39a" }}
                >
                  ${commission?.toFixed(2) ?? "—"}
                </div>
                <div style={{ fontSize: 11, color: "#7d92b5" }}>
                  ตาม Tier คะแนน QA ({tot.avg_score ?? 0})
                </div>
              </div>
            </div>
            <div style={card}>
              <p style={title}>กราฟทักษะแอดมิน</p>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Radar data={radar} />
              </div>
            </div>
            <div style={{ ...card, gridColumn: "1 / -1" }}>
              <p style={title}>🤖 คำแนะนำจาก AI (ล่าสุด)</p>
              {(d?.coaching_recommendations || []).slice(0, 4).map((c) => (
                <CoachCard key={c.id} c={c} />
              ))}
              {!d?.coaching_recommendations?.length && (
                <div style={{ color: "#7d92b5", fontSize: 12 }}>
                  ไม่มีเคสที่ต้องปรับปรุง 🎉
                </div>
              )}
            </div>
          </div>
        )}

        {/* MANAGER (3.2) */}
        {tab === "manager" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr",
              gap: 16,
            }}
          >
            <div style={card}>
              <p style={title}>แนวโน้มคะแนนทีม</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <Gauge
                  label="คะแนน QC เฉลี่ยทีม"
                  value={tot.avg_score}
                  sub="score"
                />
                <Gauge label="ตรวจทั้งหมด" value={tot.total} />
                <Gauge label="ตอบเฉลี่ย" value={fmtSec(tot.avg_response_sec)} />
                <Gauge
                  label="ความครอบคลุม SOP"
                  value={(d?.sop_coverage?.percent ?? 0) + "%"}
                />
              </div>
              <Trend data={d?.trend} />
            </div>
            <div style={card}>
              <p style={title}>จุดที่ทีมทำพลาดบ่อย (หมวดอ่อนสุด)</p>
              <Bars
                rows={(d?.bottleneck || []).map((b) => ({
                  label: b.intent,
                  v: b.avg_score,
                  color: sc(b.avg_score),
                }))}
                max={100}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <div
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: 10,
                    background: "#0e1c33",
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{ fontSize: 22, fontWeight: 900, color: "#ff6b6b" }}
                  >
                    {d?.fatal_errors ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: "#7d92b5" }}>
                    ผิดร้ายแรง
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: 10,
                    background: "#0e1c33",
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{ fontSize: 22, fontWeight: 900, color: "#f5b341" }}
                  >
                    {d?.minor_errors ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: "#7d92b5" }}>
                    ผิดเล็กน้อย
                  </div>
                </div>
              </div>
            </div>
            <div style={{ ...card, gridColumn: "1 / -1" }}>
              <p style={title}>Intent Distribution</p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0 24px",
                }}
              >
                <Bars
                  rows={(d?.intent_distribution || []).map((x) => ({
                    label: x.intent,
                    v: x.n,
                  }))}
                />
              </div>
            </div>
          </div>
        )}

        {/* LEADERBOARD (3.3) */}
        {tab === "leaderboard" && (
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            <div style={card}>
              <p style={title}>🏆 แอดมินผลงานดีที่สุด</p>
              <table style={tbl}>
                <thead>
                  <tr>
                    <Th>อันดับ</Th>
                    <Th>แอดมิน</Th>
                    <Th>ตรวจ</Th>
                    <Th>คะแนน</Th>
                    <Th>ผิดร้ายแรง</Th>
                  </tr>
                </thead>
                <tbody>
                  {(d?.admin_ranking || []).map((a, i) => (
                    <tr
                      key={a.admin_id}
                      style={
                        a.admin_id === me.adminId
                          ? { background: "#15325c" }
                          : {}
                      }
                    >
                      <Td>{i + 1}</Td>
                      <Td>{a.admin}</Td>
                      <Td>{a.replies}</Td>
                      <Td>
                        <b style={{ color: sc(a.avg_score) }}>{a.avg_score}</b>
                      </Td>
                      <Td style={{ color: "#ff6b6b" }}>{a.fatal || 0}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={card}>
              <p style={title}>📈 พัฒนาดีขึ้นมากที่สุด</p>
              <table style={tbl}>
                <thead>
                  <tr>
                    <Th>แอดมิน</Th>
                    <Th>ก่อน</Th>
                    <Th>หลัง</Th>
                    <Th>+เพิ่ม</Th>
                  </tr>
                </thead>
                <tbody>
                  {(d?.most_improved || []).map((a) => (
                    <tr key={a.admin}>
                      <Td>{a.admin}</Td>
                      <Td style={{ color: "#7d92b5" }}>{a.first_half}</Td>
                      <Td>
                        <b>{a.second_half}</b>
                      </Td>
                      <Td style={{ color: "#22d39a" }}>+{a.delta}</Td>
                    </tr>
                  ))}
                  {!d?.most_improved?.length && (
                    <tr>
                      <Td colSpan="4" style={{ color: "#7d92b5" }}>
                        ยังไม่มีข้อมูลพอ
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p style={{ ...title, marginTop: 16 }}>Commission Tiers</p>
              <Bars
                rows={TIERS.map(([k, l, c]) => ({
                  label: l,
                  v: cm[k] || 0,
                  color: c,
                }))}
              />
            </div>
          </div>
        )}

        {/* MARKETING (3.4) */}
        {tab === "marketing" && (
          <div style={card}>
            <p style={title}>
              📣 Marketing — Registration / KYC / Deposit / Withdraw / Promotion
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5,1fr)",
                gap: 12,
              }}
            >
              {["register", "kyc", "deposit", "withdraw", "promotion"].map(
                (ev) => {
                  const r = (d?.marketing?.events || []).find(
                    (e) => e.event_type === ev,
                  );
                  const labels = {
                    register: "Registration",
                    kyc: "KYC",
                    deposit: "Deposit",
                    withdraw: "Withdraw",
                    promotion: "Promotion",
                  };
                  return (
                    <div
                      key={ev}
                      style={{
                        padding: 14,
                        background: "#0e1c33",
                        borderRadius: 12,
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#8fb0e0" }}>
                        {labels[ev]}
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 900 }}>
                        {r?.n ?? 0}
                      </div>
                      {r?.amount ? (
                        <div style={{ fontSize: 12, color: "#22d39a" }}>
                          ฿{r.amount.toLocaleString()}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "#5b6f93" }}>คน</div>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          </div>
        )}

        {/* COACHING */}
        {tab === "coaching" && (
          <div style={card}>
            <p style={title}>🎓 AI Feedback & Coaching</p>
            {(d?.coaching_recommendations || []).map((c) => (
              <CoachCard key={c.id} c={c} showAdmin />
            ))}
            {!d?.coaching_recommendations?.length && (
              <div style={{ color: "#7d92b5" }}>ไม่มีเคสที่ต้อง coaching</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CoachCard({ c, showAdmin }) {
  const co = c.coaching || {};
  return (
    <div
      style={{
        border: "1px solid #21406e",
        borderRadius: 12,
        padding: 12,
        margin: "8px 0",
        background: "#0e1c33",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
        }}
      >
        <b>
          {showAdmin ? (c.admin || "—") + " · " : ""}
          <span style={{ color: sc(c.final_score) }}>{c.final_score}</span>{" "}
          {c.is_fatal && <span style={{ color: "#ff6b6b" }}>FATAL</span>}
        </b>
        <span style={{ color: "#7d92b5" }}>{c.intent}</span>
      </div>
      <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.7 }}>
        <div>
          <b style={{ color: "#8fb0e0" }}>❓ ลูกค้า:</b>{" "}
          {co.customer_question || "—"}
        </div>
        <div>
          <b style={{ color: "#8fb0e0" }}>💬 ตอบ:</b> {co.admin_answer || "—"}
        </div>
        {co.matched_sop && (
          <div>
            <b style={{ color: "#8fb0e0" }}>📋 SOP:</b> {co.matched_sop.topic}
          </div>
        )}
        <div style={{ color: "#f5b341" }}>
          <b>⚠️</b> {(co.reasons || []).join(" · ")}
        </div>
        {co.suggested_reply && (
          <div
            style={{
              background: "#0d2f25",
              borderRadius: 8,
              padding: 8,
              marginTop: 5,
              border: "1px solid #1d5c43",
            }}
          >
            <b style={{ color: "#22d39a" }}>✅ ควรตอบ:</b>{" "}
            {String(co.suggested_reply).slice(0, 220)}
          </div>
        )}
      </div>
    </div>
  );
}

const dateInp = {
  background: "#0e1c33",
  border: "1px solid #27456f",
  color: "#eaf2ff",
  borderRadius: 8,
  padding: "7px 9px",
  fontSize: 12,
};
const btn = {
  border: 0,
  borderRadius: 10,
  padding: "8px 14px",
  fontWeight: 800,
  cursor: "pointer",
  color: "#fff",
  background: "linear-gradient(135deg,#0b5cab,#09a8d8)",
};
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const Th = ({ children }) => (
  <th
    style={{
      textAlign: "left",
      color: "#5b6f93",
      fontSize: 11,
      borderBottom: "1px solid #1c3354",
      padding: "8px 6px",
    }}
  >
    {children}
  </th>
);
const Td = ({ children, ...p }) => (
  <td
    {...p}
    style={{
      padding: "8px 6px",
      borderBottom: "1px solid #14253f",
      ...(p.style || {}),
    }}
  >
    {children}
  </td>
);

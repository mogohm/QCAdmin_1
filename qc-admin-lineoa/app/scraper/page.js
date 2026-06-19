"use client";
import { useEffect, useState, useRef } from "react";

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () =>
  new Date(Date.now() - 86400000).toISOString().slice(0, 10);

function statusColor(s) {
  return s === "done"
    ? "#22c55e"
    : s === "running"
      ? "#2196f3"
      : s === "error"
        ? "#ef4444"
        : s === "cancelled"
          ? "#9ca3af"
          : "#f59e0b";
}
function statusLabel(s) {
  return (
    {
      pending: "⏳ รอ scraper รับงาน",
      running: "🔄 กำลังดึงข้อมูล",
      done: "✅ เสร็จแล้ว",
      error: "❌ ผิดพลาด",
      cancelled: "🚫 ยกเลิก",
    }[s] || s
  );
}
function fmtCountdown(ms) {
  if (!ms || ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function readCfg() {
  try {
    return JSON.parse(localStorage.getItem("qc_schedule") || "null");
  } catch {
    return null;
  }
}
function scoreColor(s) {
  if (s == null) return "#94a3b8";
  if (s >= 85) return "#22c55e";
  if (s >= 70) return "#f59e0b";
  return "#ef4444";
}
function fmtTs(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("th-TH");
  } catch {
    return ts;
  }
}
function fmtDateTH(iso) {
  if (!iso || iso.length < 10) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function ScrapeDiagram() {
  const box = (label, num, color, x, y, w, h, desc) => (
    <g key={num}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
      />
      <rect x={x + 6} y={y - 10} width={22} height={20} rx={4} fill={color} />
      <text
        x={x + 17}
        y={y + 4}
        textAnchor="middle"
        fill="#fff"
        fontSize={11}
        fontWeight="bold"
      >
        {num}
      </text>
      <text
        x={x + w / 2}
        y={y + h + 16}
        textAnchor="middle"
        fill={color}
        fontSize={10}
        fontWeight="600"
      >
        {desc}
      </text>
    </g>
  );
  return (
    <div
      style={{
        background: "#0f172a",
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
        overflowX: "auto",
      }}
    >
      <div
        style={{
          color: "#94a3b8",
          fontSize: 11,
          marginBottom: 8,
          fontFamily: "monospace",
        }}
      >
        ▼ แผนผัง: LINE Official Account Manager — จุดที่ Scraper ดึงข้อมูล
      </div>
      <svg
        viewBox="0 0 780 260"
        style={{ width: "100%", maxWidth: 780, display: "block" }}
      >
        <rect width={780} height={260} rx={8} fill="#1e293b" />
        <rect x={4} y={4} width={55} height={252} rx={6} fill="#0a1628" />
        <text
          x={31}
          y={28}
          textAnchor="middle"
          fill="#3b82f6"
          fontSize={8}
          fontWeight="bold"
        >
          LINE
        </text>
        <text x={31} y={42} textAnchor="middle" fill="#64748b" fontSize={7}>
          Chats
        </text>
        <text x={31} y={54} textAnchor="middle" fill="#64748b" fontSize={7}>
          Contact
        </text>
        <text x={31} y={66} textAnchor="middle" fill="#64748b" fontSize={7}>
          Msg Multi
        </text>
        <rect x={62} y={4} width={165} height={252} rx={4} fill="#162032" />
        <rect x={62} y={4} width={165} height={22} rx={4} fill="#1e3a5f" />
        <text x={144} y={18} textAnchor="middle" fill="#93c5fd" fontSize={9}>
          ≡ All 🔍 Search
        </text>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <g key={i}>
            <circle cx={82} cy={44 + i * 32} r={10} fill="#1e3a5f" />
            <rect
              x={96}
              y={36 + i * 32}
              width={110}
              height={8}
              rx={3}
              fill="#1e3a5f"
            />
            <rect
              x={96}
              y={48 + i * 32}
              width={80}
              height={6}
              rx={3}
              fill="#0f2440"
            />
            <text x={163} y={42 + i * 32} fill="#64748b" fontSize={7}>
              10:2{i}
            </text>
          </g>
        ))}
        <rect
          x={64}
          y={68}
          width={161}
          height={30}
          rx={3}
          fill="#1d4ed820"
          stroke="#3b82f6"
          strokeWidth={1}
        />
        <rect x={590} y={4} width={186} height={80} rx={4} fill="#162032" />
        <circle cx={618} cy={28} r={14} fill="#1e3a5f" />
        <text x={618} y={32} textAnchor="middle" fill="#3b82f6" fontSize={9}>
          👤
        </text>
        <text x={640} y={24} fill="#e2e8f0" fontSize={9} fontWeight="bold">
          838160/0958672075
        </text>
        <text x={640} y={36} fill="#94a3b8" fontSize={8}>
          (Nice)
        </text>
        <text x={593} y={54} fill="#64748b" fontSize={7}>
          + Add tags
        </text>
        <text x={593} y={66} fill="#64748b" fontSize={7}>
          Assign 🟢 PK - Jane ✏️
        </text>
        <rect x={230} y={4} width={356} height={212} rx={4} fill="#0f172a" />
        <rect x={230} y={4} width={356} height={20} rx={4} fill="#1e293b" />
        <text x={408} y={16} textAnchor="middle" fill="#94a3b8" fontSize={8}>
          838160/0958672075 ● Follow up ✓ Resolve 🔍 Search
        </text>
        <rect x={238} y={32} width={130} height={28} rx={10} fill="#1e293b" />
        <text x={248} y={48} fill="#e2e8f0" fontSize={8}>
          ไม่พูดคุยครับ
        </text>
        <rect x={238} y={68} width={150} height={28} rx={10} fill="#1e293b" />
        <text x={248} y={84} fill="#e2e8f0" fontSize={8}>
          บัตรสำรวจที่ไหนดีครับ
        </text>
        <rect x={376} y={106} width={200} height={42} rx={10} fill="#1d4ed8" />
        <text x={386} y={122} fill="#fff" fontSize={7.5}>
          ♦ แจ้งยืนยันตรวจสอบแล้ว
        </text>
        <text x={386} y={133} fill="#bfdbfe" fontSize={7}>
          ขอบคุณที่ใช้บริการทางการตรวจสอบ
        </text>
        <text x={386} y={143} fill="#bfdbfe" fontSize={7}>
          ทำงานทุกวัน 09:00 น.
        </text>
        <text x={548} y={153} fill="#60a5fa" fontSize={7}>
          PK - Jane
        </text>
        <text x={260} y={170} fill="#22c55e" fontSize={8} fontWeight="bold">
          ← ลูกค้า (Left)
        </text>
        <text x={440} y={170} fill="#3b82f6" fontSize={8} fontWeight="bold">
          Admin (Right) →
        </text>
        <rect x={230} y={218} width={356} height={22} rx={4} fill="#1e293b" />
        <text x={340} y={231} fill="#64748b" fontSize={7}>
          Enter: Send message, Shift+Enter: New line
        </text>
        <rect x={556} y={220} width={26} height={18} rx={4} fill="#22c55e" />
        <text
          x={569}
          y={231}
          textAnchor="middle"
          fill="#fff"
          fontSize={8}
          fontWeight="bold"
        >
          Send
        </text>
        <rect x={590} y={88} width={186} height={168} rx={4} fill="#162032" />
        <text x={597} y={102} fill="#94a3b8" fontSize={8} fontWeight="bold">
          Notes 1/1000 +
        </text>
        <rect x={592} y={107} width={182} height={110} rx={4} fill="#1e293b" />
        <text x={600} y={120} fill="#e2e8f0" fontSize={7.5}>
          ชื่อ - นามสกุล(ไทย): นายจักร นาคทอง
        </text>
        <text x={600} y={131} fill="#e2e8f0" fontSize={7.5}>
          ชื่อ - นามสกุล(Eng): thanawat
        </text>
        <text x={600} y={142} fill="#e2e8f0" fontSize={7.5}>
          Nickname: KimberRR
        </text>
        <text x={600} y={153} fill="#e2e8f0" fontSize={7.5}>
          สาขา: กลศวิทยา
        </text>
        <text x={600} y={164} fill="#e2e8f0" fontSize={7.5}>
          เลขทบัตร: 0443190/16
        </text>
        <text x={600} y={175} fill="#e2e8f0" fontSize={7.5}>
          เบอร์โทร: 0958672075
        </text>
        <text x={600} y={186} fill="#94a3b8" fontSize={7}>
          5/13/2026, 23:27 PK Fern
        </text>
        <rect x={592} y={218} width={182} height={18} rx={4} fill="#1e3a5f" />
        <text x={683} y={229} textAnchor="middle" fill="#64748b" fontSize={7}>
          ✏️ แก้ไข 🗑️ ลบ
        </text>
        {box("", "1", "#3b82f6", 62, 4, 165, 252, "Chat List — กรองวันที่")}
        {box("", "2", "#22c55e", 590, 4, 186, 80, "ชื่อลูกค้า")}
        {box("", "3", "#f59e0b", 230, 4, 356, 234, "ข้อความ Q&A + ชื่อ Admin")}
        {box("", "4", "#a855f7", 590, 88, 186, 168, "Notes + วันที่ + Admin")}
      </svg>
    </div>
  );
}

export default function ScraperPage() {
  const [key, setKey] = useState("");
  const [dateFrom, setDateFrom] = useState(yesterday());
  const [dateTo, setDateTo] = useState(today());
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // schedule
  const [cfg, setCfg] = useState(null);
  const [intervalMin, setIntervalMin] = useState(30);
  const [countdown, setCountdown] = useState(0);
  const tickRef = useRef(null);
  const pollRef = useRef(null);
  const prevJobsRef = useRef([]);

  // report
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [expanded, setExpanded] = useState(new Set());
  const [showDiagram, setShowDiagram] = useState(false);
  const loadReportRef = useRef(null);

  const loadReport = async (from, to) => {
    const f = from ?? dateFrom;
    const t = to ?? dateTo;
    setReportLoading(true);
    try {
      const r = await fetch(`/api/scraper/report?from=${f}&to=${t}`);
      const d = await r.json();
      setReportData(d);
      setExpanded(new Set());
    } catch (e) {
      setReportData({ error: e.message });
    } finally {
      setReportLoading(false);
    }
  };
  loadReportRef.current = loadReport;

  const loadJobs = async () => {
    try {
      const r = await fetch("/api/scraper/job");
      const data = await r.json();
      const newJobs = Array.isArray(data) ? data : [];
      setJobs(newJobs);
      // auto-refresh report when a job just finished
      const prev = prevJobsRef.current;
      const justDone = newJobs.find(
        (j) =>
          j.status === "done" &&
          prev.find((p) => p.id === j.id && p.status !== "done"),
      );
      if (justDone) loadReportRef.current?.();
      prevJobsRef.current = newJobs;
    } catch {}
  };

  useEffect(() => {
    const saved = localStorage.getItem("qc_api_key") || "";
    if (saved) setKey(saved);
    const c = readCfg();
    if (c) {
      setCfg(c);
      setIntervalMin(c.intervalMin || 30);
    }
    loadJobs();
    loadReportRef.current?.();
    pollRef.current = setInterval(loadJobs, 3000);
    tickRef.current = setInterval(() => {
      const c2 = readCfg();
      if (c2?.on && c2.nextRun)
        setCountdown(Math.max(0, c2.nextRun - Date.now()));
    }, 1000);
    return () => {
      clearInterval(pollRef.current);
      clearInterval(tickRef.current);
    };
  }, []);

  useEffect(() => {
    if (key) localStorage.setItem("qc_api_key", key);
  }, [key]);

  async function submitJob(from, to, quiet = false) {
    if (!key) {
      setMsg("ใส่ ADMIN_API_KEY ก่อน");
      return false;
    }
    try {
      const r = await fetch("/api/scraper/job", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: JSON.stringify({ date_from: from, date_to: to }),
      });
      const d = await r.json();
      if (d.ok) {
        if (!quiet) setMsg("✅ สร้าง job แล้ว");
        loadJobs();
        return true;
      }
      setMsg("❌ " + d.error);
      return false;
    } catch (e) {
      setMsg("❌ " + e.message);
      return false;
    }
  }

  async function startJob() {
    setLoading(true);
    setMsg("");
    await submitJob(dateFrom, dateTo);
    setLoading(false);
  }

  function enableSchedule() {
    if (!key) {
      setMsg("ใส่ ADMIN_API_KEY ก่อน");
      return;
    }
    const intervalMs = intervalMin * 60 * 1000;
    const nextRun = Date.now() + intervalMs;
    const newCfg = { on: true, key, intervalMin, intervalMs, nextRun };
    localStorage.setItem("qc_schedule", JSON.stringify(newCfg));
    setCfg(newCfg);
    setCountdown(intervalMs);
    setMsg("");
    submitJob(today(), today(), true).then((ok) => {
      if (ok) setMsg(`✅ สร้าง job ทันที — รันครั้งหน้าใน ${intervalMin} นาที`);
    });
  }

  function disableSchedule() {
    const newCfg = { on: false };
    localStorage.setItem("qc_schedule", JSON.stringify(newCfg));
    setCfg(newCfg);
    setMsg("⏹️ ปิด Auto-Schedule แล้ว");
  }

  async function cancelJob() {
    if (!key) {
      setMsg("ใส่ ADMIN_API_KEY ก่อน");
      return;
    }
    if (!confirm("ยืนยันยกเลิก Scrape?")) return;
    try {
      const r = await fetch("/api/scraper/job", {
        method: "DELETE",
        headers: { "x-api-key": key },
      });
      const d = await r.json();
      if (d.ok) {
        setMsg(`🚫 ยกเลิกแล้ว (${d.cancelled} job)`);
        loadJobs();
      } else setMsg("❌ " + d.error);
    } catch (e) {
      setMsg("❌ " + e.message);
    }
  }

  function toggle(uid) {
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(uid) ? s.delete(uid) : s.add(uid);
      return s;
    });
  }

  const scheduleOn = cfg?.on === true;
  const activeJob = jobs.find(
    (j) => j.status === "running" || j.status === "pending",
  );

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          QC<span>Admin</span>
        </div>
        <nav className="nav">
          <a href="/">Dashboard</a>
          <a href="/admin">Admin Console</a>
          <a className="active" href="/scraper">
            Scraper
          </a>
          <a href="/rules">⚙️ QC Rules</a>
          <a href="/docs">Setup Docs</a>
          <a href="/scraper-test">🔬 Scraper Test</a>
          <a href="/PROJECT_DOCS.html" target="_blank">
            📄 Project Docs
          </a>
        </nav>
        <div style={{ marginTop: "auto", padding: "16px 0", fontSize: 12 }}>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: scheduleOn ? "#f0fdf4" : "#f8fafc",
              border: `1px solid ${scheduleOn ? "#86efac" : "#e5e7eb"}`,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                color: scheduleOn ? "#16a34a" : "#888",
                marginBottom: 4,
              }}
            >
              {scheduleOn ? "⏰ Auto-Schedule ON" : "⏰ Auto-Schedule OFF"}
            </div>
            {scheduleOn && (
              <>
                <div style={{ color: "#555" }}>ทุก {cfg.intervalMin} นาที</div>
                <div
                  style={{
                    color: "#2196f3",
                    fontWeight: 700,
                    fontFamily: "monospace",
                    fontSize: 16,
                    marginTop: 4,
                  }}
                >
                  {fmtCountdown(countdown)}
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="top">
          <div>
            <h1>Scraper Control & Report</h1>
            <p className="muted">รัน job ดึงข้อมูลและดูผลลัพธ์ในหน้าเดียวกัน</p>
          </div>
        </div>

        {/* ===== ACTIVE JOB BANNER ===== */}
        {activeJob ? (
          <div
            style={{
              background:
                activeJob.status === "running" ? "#eff6ff" : "#fffbeb",
              border: `2px solid ${activeJob.status === "running" ? "#2196f3" : "#f59e0b"}`,
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: statusColor(activeJob.status),
                }}
              >
                {statusLabel(activeJob.status)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "#666" }}>
                  {activeJob.date_from} — {activeJob.date_to}
                </span>
                <button
                  onClick={cancelJob}
                  style={{
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: "#fef2f2",
                    color: "#dc2626",
                    border: "1px solid #fca5a5",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  🚫 ยกเลิก
                </button>
              </div>
            </div>
            {activeJob.total_chats > 0 && (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: 24,
                    fontSize: 13,
                    marginBottom: 6,
                  }}
                >
                  <span>
                    📂 ห้อง chat ทั้งหมด <b>{activeJob.total_chats}</b> ห้อง
                  </span>
                  <span>
                    📝 บันทึกได้ <b>{activeJob.logged_count || 0}</b> ข้อความ
                  </span>
                </div>
                {activeJob.status === "running" && (
                  <div
                    style={{
                      background: "#dbeafe",
                      borderRadius: 6,
                      height: 8,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        background: "#2196f3",
                        height: 8,
                        borderRadius: 6,
                        width: "100%",
                        animation: "progress-pulse 1.5s ease-in-out infinite",
                      }}
                    />
                  </div>
                )}
              </>
            )}
            {activeJob.current_chat && (
              <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
                🔍 chat ปัจจุบัน: {activeJob.current_chat}
              </div>
            )}
            <div
              style={{
                fontSize: 12,
                marginTop: 6,
                color: activeJob.status === "running" ? "#16a34a" : "#a16207",
              }}
            >
              {activeJob.status === "running"
                ? "🟢 scraper ออนไลน์ — กำลังทำงาน"
                : "🟡 รอ scraper รับงาน (เปิด npm run scraper:watch บนเครื่อง)"}
              {activeJob.started_at && (
                <span style={{ color: "#888" }}>
                  {" "}
                  · เริ่ม{" "}
                  {new Date(activeJob.started_at).toLocaleString("th-TH")}
                </span>
              )}
              {activeJob.error_text && (
                <span style={{ color: "#ef4444" }}>
                  {" "}
                  · ⚠️ {activeJob.error_text}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: 10,
              padding: "10px 16px",
              marginBottom: 20,
              fontSize: 13,
              color: "#16a34a",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>✅</span>
            <span>ไม่มี job กำลังทำงาน</span>
            {scheduleOn && (
              <span style={{ marginLeft: "auto", color: "#555" }}>
                รันครั้งหน้าใน{" "}
                <b style={{ fontFamily: "monospace" }}>
                  {fmtCountdown(countdown)}
                </b>
              </span>
            )}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 20,
          }}
        >
          {/* ===== AUTO SCHEDULE ===== */}
          <div
            className="card"
            style={{
              border: scheduleOn ? "2px solid #22c55e" : "1px solid #e5e7eb",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {scheduleOn && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 4,
                  background: "linear-gradient(90deg,#22c55e,#16a34a)",
                }}
              />
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <h2 style={{ margin: 0 }}>⏰ Auto-Schedule</h2>
              {scheduleOn && (
                <span
                  style={{
                    fontSize: 12,
                    background: "#dcfce7",
                    color: "#16a34a",
                    padding: "2px 8px",
                    borderRadius: 12,
                    fontWeight: 600,
                  }}
                >
                  ACTIVE
                </span>
              )}
            </div>
            {scheduleOn ? (
              <div>
                <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
                  สร้าง job อัตโนมัติทุก <b>{cfg.intervalMin} นาที</b>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#888" }}>
                    รันครั้งหน้าใน:
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      fontFamily: "monospace",
                      color: countdown < 60000 ? "#ef4444" : "#2196f3",
                    }}
                  >
                    {fmtCountdown(countdown)}
                  </div>
                </div>
                <div
                  style={{
                    background: "#e5e7eb",
                    borderRadius: 4,
                    height: 6,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      background: "#22c55e",
                      borderRadius: 4,
                      height: 6,
                      width: `${100 - Math.round((countdown / (cfg.intervalMs || 1)) * 100)}%`,
                      transition: "width 1s linear",
                    }}
                  />
                </div>
                <button
                  onClick={disableSchedule}
                  style={{
                    width: "100%",
                    padding: "8px",
                    background: "#fef2f2",
                    color: "#ef4444",
                    border: "1px solid #fca5a5",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  ⏹ ปิด Auto-Schedule
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                  เปิดให้ scraper สร้าง job อัตโนมัติโดยไม่ต้องกดเอง
                  <br />
                  <span style={{ fontSize: 12, color: "#999" }}>
                    ทำงานตลอดที่แอปเปิดอยู่
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <label
                    style={{
                      fontSize: 13,
                      color: "#555",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ทำงานทุก
                  </label>
                  <select
                    value={intervalMin}
                    onChange={(e) => setIntervalMin(Number(e.target.value))}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: 6,
                    }}
                  >
                    {[15, 30, 45, 60, 90, 120].map((m) => (
                      <option key={m} value={m}>
                        {m} นาที
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={enableSchedule}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "#22c55e",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  ▶ เปิด Auto-Schedule
                </button>
              </div>
            )}
          </div>

          {/* ===== MANUAL JOB ===== */}
          <div className="card">
            <h2>▶ Scrape ทันที</h2>
            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "#666",
                  marginBottom: 4,
                }}
              >
                ADMIN_API_KEY
              </label>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="key..."
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#666",
                    marginBottom: 2,
                  }}
                >
                  จาก
                </label>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 4,
                    fontFamily: "monospace",
                  }}
                >
                  {fmtDateTH(dateFrom)}
                </div>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#666",
                    marginBottom: 2,
                  }}
                >
                  ถึง
                </label>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 4,
                    fontFamily: "monospace",
                  }}
                >
                  {fmtDateTH(dateTo)}
                </div>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
            <button
              onClick={startJob}
              disabled={loading || !!activeJob}
              style={{
                width: "100%",
                padding: "10px",
                fontWeight: 700,
                opacity: loading || activeJob ? 0.5 : 1,
                cursor: loading || activeJob ? "not-allowed" : "pointer",
              }}
            >
              {loading
                ? "..."
                : activeJob
                  ? "มี job อยู่แล้ว"
                  : "▶ เริ่ม Scrape"}
            </button>
            {msg && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  background: msg.startsWith("✅")
                    ? "#f0fdf4"
                    : msg.startsWith("⏹")
                      ? "#f8fafc"
                      : "#fef2f2",
                  color: msg.startsWith("✅")
                    ? "#16a34a"
                    : msg.startsWith("⏹")
                      ? "#555"
                      : "#dc2626",
                }}
              >
                {msg}
              </div>
            )}
          </div>
        </div>

        {/* ===== JOB HISTORY ===== */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2>ประวัติ Jobs</h2>
          {jobs.length === 0 ? (
            <div style={{ color: "#999", padding: "16px 0" }}>ยังไม่มี job</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>ช่วงวันที่</th>
                  <th>สถานะ</th>
                  <th>ห้อง chat</th>
                  <th>ข้อความ</th>
                  <th>ใช้เวลา</th>
                  <th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const sec =
                    j.started_at && j.finished_at
                      ? Math.round(
                          (new Date(j.finished_at) - new Date(j.started_at)) /
                            1000,
                        )
                      : null;
                  return (
                    <tr key={j.id}>
                      <td
                        style={{
                          fontSize: 11,
                          color: "#888",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {new Date(j.created_at).toLocaleString("th-TH")}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {j.date_from} — {j.date_to}
                      </td>
                      <td>
                        <span
                          style={{
                            color: statusColor(j.status),
                            fontWeight: 600,
                            fontSize: 12,
                          }}
                        >
                          {statusLabel(j.status)}
                        </span>
                      </td>
                      <td>{j.total_chats || "—"}</td>
                      <td
                        style={{
                          fontWeight: j.logged_count > 0 ? 600 : 400,
                          color: j.logged_count > 0 ? "#16a34a" : "#999",
                        }}
                      >
                        {j.logged_count || "—"}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {sec !== null ? `${sec}s` : j.started_at ? "..." : "—"}
                      </td>
                      <td
                        style={{
                          fontSize: 12,
                          color: "#ef4444",
                          maxWidth: 160,
                        }}
                      >
                        {j.error_text || ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ===== INSTRUCTIONS ===== */}
        <div
          className="card"
          style={{ marginBottom: 24, background: "#f8fafc", fontSize: 13 }}
        >
          <h2>วิธีเปิด Scraper บนเครื่อง</h2>
          <div style={{ fontFamily: "monospace", lineHeight: 2.2 }}>
            <div style={{ color: "#888" }}>
              # 1) login LINE OA ครั้งแรก (เปิด browser ให้ login แล้ว save
              session)
            </div>
            <div>npm run scraper:login</div>
            <div style={{ marginTop: 6, color: "#888" }}>
              # 2) poll งาน + scrape ต่อเนื่อง (รอรับ job จากเว็บ)
            </div>
            <div>npm run scraper:watch</div>
            <div style={{ marginTop: 6, color: "#888" }}>
              # หรือรันพร้อม schedule สร้าง job Yesterday อัตโนมัติทุก 30 นาที
            </div>
            <div>node scraper.js --watch --schedule=30</div>
            <div style={{ marginTop: 6, color: "#888" }}>
              # ดึงวันเดียว / ช่วงวันที่
            </div>
            <div>node scraper.js --date=2026-06-16</div>
            <div>node scraper.js --from=2026-06-10 --to=2026-06-16</div>
          </div>
          <div style={{ marginTop: 10, color: "#888" }}>
            ENV: <code>QC_API_URL</code> · <code>QC_API_KEY</code> ·{" "}
            <code>LINE_OA_URL</code> · <code>SCRAPER_HEADLESS</code> ·{" "}
            <code>SCRAPER_DEBUG</code> — session เก็บที่{" "}
            <code>.storage/line-auth.json</code> (debug evidence ที่{" "}
            <code>.storage/debug/</code>)
          </div>
        </div>

        {/* ===== DIVIDER ===== */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#374151",
              whiteSpace: "nowrap",
            }}
          >
            📊 Scrape Report
          </span>
          <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
        </div>

        {/* ===== REPORT FILTER ===== */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "#666",
                  marginBottom: 2,
                }}
              >
                จากวันที่
              </label>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: 4,
                  fontFamily: "monospace",
                }}
              >
                {fmtDateTH(dateFrom)}
              </div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  padding: "7px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "#666",
                  marginBottom: 2,
                }}
              >
                ถึงวันที่
              </label>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: 4,
                  fontFamily: "monospace",
                }}
              >
                {fmtDateTH(dateTo)}
              </div>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  padding: "7px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                }}
              />
            </div>
            <button
              onClick={() => loadReport(dateFrom, dateTo)}
              disabled={reportLoading}
              style={{
                padding: "8px 20px",
                fontWeight: 700,
                opacity: reportLoading ? 0.5 : 1,
                cursor: reportLoading ? "not-allowed" : "pointer",
              }}
            >
              {reportLoading ? "⏳ โหลด..." : "🔍 ดูรายงาน"}
            </button>
            <button
              onClick={() => setShowDiagram((v) => !v)}
              style={{
                padding: "8px 14px",
                background: "#f1f5f9",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                color: "#374151",
              }}
            >
              {showDiagram ? "🗺️ ซ่อนแผนผัง" : "🗺️ แผนผัง"}
            </button>
          </div>
        </div>

        {showDiagram && <ScrapeDiagram />}

        {reportData?.error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: 8,
              padding: 16,
              color: "#dc2626",
              marginBottom: 16,
            }}
          >
            ❌ {reportData.error}
          </div>
        )}

        {reportData && !reportData.error && (
          <>
            {/* ---- Summary ---- */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 12,
                marginBottom: 20,
              }}
            >
              {[
                {
                  label: "Jobs",
                  v: reportData.jobs?.length ?? 0,
                  icon: "🔄",
                  c: "#3b82f6",
                },
                {
                  label: "Customers",
                  v: reportData.total_customers,
                  icon: "👤",
                  c: "#22c55e",
                },
                {
                  label: "Messages",
                  v: reportData.total_messages,
                  icon: "💬",
                  c: "#f59e0b",
                },
                {
                  label: "Notes",
                  v: reportData.total_notes,
                  icon: "📝",
                  c: "#a855f7",
                },
              ].map(({ label, v, icon, c }) => (
                <div
                  key={label}
                  className="card"
                  style={{ textAlign: "center", borderTop: `3px solid ${c}` }}
                >
                  <div style={{ fontSize: 22 }}>{icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: c }}>
                    {v}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
                </div>
              ))}
            </div>

            {/* ---- Jobs in range ---- */}
            {reportData.jobs?.length > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <h2 style={{ marginTop: 0 }}>🔄 Jobs ในช่วงนี้</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>วันที่สร้าง</th>
                      <th>ช่วง</th>
                      <th>สถานะ</th>
                      <th>Chat</th>
                      <th>Messages</th>
                      <th>ใช้เวลา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.jobs.map((j) => {
                      const sec =
                        j.started_at && j.finished_at
                          ? Math.round(
                              (new Date(j.finished_at) -
                                new Date(j.started_at)) /
                                1000,
                            )
                          : null;
                      const clr =
                        {
                          done: "#22c55e",
                          running: "#3b82f6",
                          error: "#ef4444",
                          cancelled: "#9ca3af",
                          pending: "#f59e0b",
                        }[j.status] || "#888";
                      return (
                        <tr key={j.id}>
                          <td style={{ fontSize: 11, color: "#888" }}>
                            {fmtTs(j.started_at || j.date_from)}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {j.date_from} — {j.date_to}
                          </td>
                          <td>
                            <span
                              style={{
                                color: clr,
                                fontWeight: 700,
                                fontSize: 12,
                              }}
                            >
                              {j.status}
                            </span>
                          </td>
                          <td>{j.total_chats || "—"}</td>
                          <td
                            style={{
                              fontWeight: 700,
                              color: j.logged_count > 0 ? "#22c55e" : "#999",
                            }}
                          >
                            {j.logged_count || "—"}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {sec !== null ? `${sec}s` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ---- Customers ---- */}
            <div className="card">
              <h2 style={{ marginTop: 0 }}>
                👤 ลูกค้าที่ถูก Scrape ({reportData.customers?.length ?? 0})
              </h2>
              {!reportData.customers?.length ? (
                <div style={{ color: "#999", padding: "16px 0" }}>
                  ไม่มีข้อมูลในช่วงนี้
                </div>
              ) : (
                reportData.customers.map((c) => {
                  const open = expanded.has(c.line_user_id);
                  const avgScr = c.messages.length
                    ? Math.round(
                        c.messages.reduce(
                          (s, m) => s + (m.final_score ?? 0),
                          0,
                        ) / c.messages.length,
                      )
                    : null;
                  return (
                    <div
                      key={c.line_user_id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        marginBottom: 12,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        onClick={() => toggle(c.line_user_id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "12px 16px",
                          background: "#f8fafc",
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                      >
                        {c.picture_url ? (
                          <img
                            src={c.picture_url}
                            alt=""
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              background: "#1e3a5f",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#60a5fa",
                              fontSize: 16,
                            }}
                          >
                            👤
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            {c.display_name || c.line_user_id}
                          </div>
                          <div style={{ fontSize: 11, color: "#888" }}>
                            {c.line_user_id}
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 16,
                            alignItems: "center",
                            fontSize: 12,
                          }}
                        >
                          <span title="Messages">💬 {c.messages.length}</span>
                          <span title="Notes">📝 {c.notes.length}</span>
                          {avgScr !== null && (
                            <span
                              style={{
                                background: scoreColor(avgScr),
                                color: "#fff",
                                padding: "2px 8px",
                                borderRadius: 8,
                                fontWeight: 700,
                                fontSize: 12,
                              }}
                            >
                              Score {avgScr}
                            </span>
                          )}
                          <span style={{ fontSize: 16 }}>
                            {open ? "▲" : "▼"}
                          </span>
                        </div>
                      </div>

                      {open && (
                        <div style={{ padding: "16px", background: "#fff" }}>
                          {c.messages.length > 0 && (
                            <>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  marginBottom: 10,
                                  borderLeft: "3px solid #f59e0b",
                                  paddingLeft: 10,
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: "#f59e0b",
                                    fontSize: 13,
                                  }}
                                >
                                  💬 ข้อความ (กรอบ 3) — {c.messages.length}{" "}
                                  รายการ
                                </span>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 8,
                                  marginBottom: 16,
                                }}
                              >
                                {c.messages.map((msg, mi) => (
                                  <div
                                    key={mi}
                                    style={{
                                      background: "#f8fafc",
                                      borderRadius: 8,
                                      padding: 12,
                                    }}
                                  >
                                    {msg.customer_text && (
                                      <div
                                        style={{
                                          display: "flex",
                                          gap: 10,
                                          marginBottom: 8,
                                        }}
                                      >
                                        <div
                                          style={{
                                            background: "#e5e7eb",
                                            borderRadius: 10,
                                            padding: "6px 12px",
                                            maxWidth: "70%",
                                            fontSize: 13,
                                          }}
                                        >
                                          <div
                                            style={{
                                              fontSize: 10,
                                              color: "#888",
                                              marginBottom: 3,
                                            }}
                                          >
                                            👤 ลูกค้า{" "}
                                            {msg.customer_created_at
                                              ? `• ${fmtTs(msg.customer_created_at)}`
                                              : ""}
                                          </div>
                                          {msg.customer_text}
                                        </div>
                                      </div>
                                    )}
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "flex-end",
                                        gap: 10,
                                      }}
                                    >
                                      <div
                                        style={{
                                          background: "#1d4ed8",
                                          color: "#fff",
                                          borderRadius: 10,
                                          padding: "6px 12px",
                                          maxWidth: "70%",
                                          fontSize: 13,
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: 10,
                                            color: "#93c5fd",
                                            marginBottom: 3,
                                          }}
                                        >
                                          🧑‍💼 {msg.admin_name || "(ไม่รู้ชื่อ)"}
                                          {msg.created_at
                                            ? ` • ${fmtTs(msg.created_at)}`
                                            : ""}
                                        </div>
                                        {msg.message_text}
                                        {msg.final_score != null && (
                                          <div
                                            style={{
                                              marginTop: 6,
                                              display: "flex",
                                              gap: 8,
                                              fontSize: 10,
                                            }}
                                          >
                                            <span
                                              style={{
                                                background: scoreColor(
                                                  msg.final_score,
                                                ),
                                                color: "#fff",
                                                padding: "1px 6px",
                                                borderRadius: 4,
                                                fontWeight: 700,
                                              }}
                                            >
                                              ⭐ {msg.final_score}
                                            </span>
                                            {msg.response_seconds != null && (
                                              <span
                                                style={{ color: "#bfdbfe" }}
                                              >
                                                ⏱ {msg.response_seconds}s
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}

                          {c.notes.length > 0 && (
                            <>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  marginBottom: 10,
                                  borderLeft: "3px solid #a855f7",
                                  paddingLeft: 10,
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: "#a855f7",
                                    fontSize: 13,
                                  }}
                                >
                                  📝 Notes (กรอบ 4) — {c.notes.length} รายการ
                                </span>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 8,
                                }}
                              >
                                {c.notes.map((n, ni) => (
                                  <div
                                    key={ni}
                                    style={{
                                      background: "#faf5ff",
                                      border: "1px solid #e9d5ff",
                                      borderRadius: 8,
                                      padding: 12,
                                    }}
                                  >
                                    <pre
                                      style={{
                                        margin: 0,
                                        fontSize: 12,
                                        whiteSpace: "pre-wrap",
                                        color: "#1e293b",
                                        fontFamily: "inherit",
                                      }}
                                    >
                                      {n.note_text}
                                    </pre>
                                    <div
                                      style={{
                                        marginTop: 8,
                                        fontSize: 11,
                                        color: "#9333ea",
                                        display: "flex",
                                        gap: 12,
                                      }}
                                    >
                                      {n.noted_at && (
                                        <span>📅 {fmtTs(n.noted_at)}</span>
                                      )}
                                      {n.noted_by && (
                                        <span>✍️ {n.noted_by}</span>
                                      )}
                                      {n.scraped_at && (
                                        <span style={{ color: "#c4b5fd" }}>
                                          Scraped: {fmtTs(n.scraped_at)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}

                          {c.messages.length === 0 && c.notes.length === 0 && (
                            <div style={{ color: "#999", fontSize: 13 }}>
                              ไม่มีข้อมูลในช่วงนี้
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </main>
      <style>{`@keyframes progress-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
    </div>
  );
}

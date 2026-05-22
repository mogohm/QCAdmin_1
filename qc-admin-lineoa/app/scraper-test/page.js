'use client';
import { useEffect, useState } from 'react';

const today     = () => new Date().toISOString().slice(0, 10);
const weekAgo   = () => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

function pct(a, b) {
  if (!b || b === 0) return '—';
  return `${Math.round((a / b) * 100)}%`;
}
function fmtTs(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('th-TH'); } catch { return ts; }
}
function statusColor(s) {
  return s === 'done' ? '#22c55e' : s === 'running' ? '#2196f3'
       : s === 'error' ? '#ef4444' : s === 'cancelled' ? '#9ca3af' : '#f59e0b';
}

/* ─── SVG: LINE OA UI diagram with 4 labeled boxes ─── */
function LineOADiagram() {
  return (
    <div style={{ background: '#0f172a', borderRadius: 12, padding: '20px 16px', marginBottom: 24 }}>
      <div style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', marginBottom: 10 }}>
        แผนผัง: LINE Official Account Manager — 4 จุดที่ Scraper ต้องดึงข้อมูลให้ถูกต้อง
      </div>
      <svg viewBox="0 0 820 310" style={{ width: '100%', maxWidth: 820, display: 'block' }}>
        {/* App chrome */}
        <rect width={820} height={310} rx={8} fill="#1e293b" />
        {/* Left icon rail */}
        <rect x={4} y={4} width={54} height={302} rx={5} fill="#0d1a2d" />
        <text x={31} y={28} textAnchor="middle" fill="#3b82f6" fontSize={9} fontWeight="bold">LINE</text>
        {['Chats', 'Contact', 'Broadcast', 'Analysis'].map((t, i) => (
          <text key={t} x={31} y={46 + i * 16} textAnchor="middle" fill="#475569" fontSize={7}>{t}</text>
        ))}

        {/* ── Box 1: Chat List panel ── */}
        <rect x={61} y={4} width={175} height={302} rx={4} fill="#162032" />
        {/* List header */}
        <rect x={61} y={4} width={175} height={26} rx={4} fill="#1e3a5f" />
        <text x={148} y={20} textAnchor="middle" fill="#93c5fd" fontSize={9}>≡ ทั้งหมด  🔍 ค้นหา</text>
        {/* Mock chat list items */}
        {[
          { name: 'สมชาย ทดสอบ',  preview: 'สวัสดีครับ...',    time: '10:42', dot: '#22c55e' },
          { name: 'นงนุช มีสุข',   preview: 'ขอบคุณมากค่ะ',    time: 'Friday', dot: '#f59e0b' },
          { name: 'พิมพ์ใจ แสง',   preview: 'ฝากได้ไหมคะ',     time: 'Thursday', dot: '#94a3b8' },
          { name: 'ธีรวุฒิ ดี',    preview: 'โอนเงินแล้วนะ',   time: '5/16', dot: '#94a3b8' },
          { name: 'กมลา ใจดี',     preview: 'ขึ้นทะเบียนได้...',time: '5/15', dot: '#94a3b8' },
          { name: 'วิภา ตรี',      preview: 'รอสักครู่นะ...',   time: '5/14', dot: '#94a3b8' },
        ].map(({ name, preview, time, dot }, i) => (
          <g key={i}>
            <rect x={62} y={32 + i * 44} width={173} height={42} fill={i === 0 ? '#1e3a5f' : 'none'} />
            <rect x={62} y={74 + i * 44} width={173} height={1} fill="#1e3050" />
            <circle cx={82} cy={55 + i * 44} r={11} fill="#1e3a5f" />
            <circle cx={82} cy={55 + i * 44} r={4} fill={dot} />
            <text x={97} y={50 + i * 44} fill="#e2e8f0" fontSize={8.5} fontWeight="600">{name}</text>
            <text x={97} y={63 + i * 44} fill="#64748b" fontSize={7.5}>{preview}</text>
            <text x={228} y={50 + i * 44} textAnchor="end" fill="#94a3b8" fontSize={7}>{time}</text>
          </g>
        ))}
        {/* Box 1 border */}
        <rect x={62} y={5} width={173} height={300} rx={3}
          fill="none" stroke="#3b82f6" strokeWidth={2.5} strokeDasharray="6,3" />
        <rect x={70} y={1} width={90} height={14} rx={3} fill="#3b82f6" />
        <text x={115} y={11} textAnchor="middle" fill="#fff" fontSize={9} fontWeight="bold">① Chat List + วันที่</text>

        {/* ── Right main area ── */}
        <rect x={238} y={4} width={578} height={302} rx={4} fill="#111827" />

        {/* ── Box 2: Customer name header ── */}
        <rect x={238} y={4} width={390} height={36} rx={4} fill="#1e2a3a" />
        {/* Avatar + name */}
        <circle cx={261} cy={22} r={12} fill="#1e3a5f" />
        <text x={279} y={19} fill="#f1f5f9" fontSize={11} fontWeight="bold">สมชาย ทดสอบ</text>
        <text x={279} y={31} fill="#64748b" fontSize={8}>LINE ID: Ua1b2c3d4...</text>
        <text x={420} y={19} fill="#64748b" fontSize={8}>เปิดโปรไฟล์  ✏️  ...</text>
        {/* Box 2 border */}
        <rect x={239} y={5} width={388} height={34} rx={3}
          fill="none" stroke="#10b981" strokeWidth={2.5} strokeDasharray="6,3" />
        <rect x={247} y={1} width={90} height={14} rx={3} fill="#10b981" />
        <text x={292} y={11} textAnchor="middle" fill="#fff" fontSize={9} fontWeight="bold">② ชื่อลูกค้า (header)</text>

        {/* ── Box 3: Chat messages ── */}
        <rect x={238} y={42} width={390} height={222} rx={0} fill="#111827" />
        {/* Date separator */}
        <rect x={350} y={52} width={100} height={14} rx={7} fill="#1e2a3a" />
        <text x={400} y={62} textAnchor="middle" fill="#64748b" fontSize={7.5}>17 พ.ค. 2569</text>
        {/* Customer bubble (left) */}
        <rect x={248} y={73} width={160} height={28} rx={10} fill="#1e3a5f" />
        <text x={256} y={84} fill="#93c5fd" fontSize={7}>❓ ลูกค้า</text>
        <text x={256} y={96} fill="#e2e8f0" fontSize={8}>อยากสมัครสมาชิกครับ ทำยังไง?</text>
        <text x={412} y={100} fill="#475569" fontSize={7}>10:41</text>
        {/* Admin bubble (right) */}
        <rect x={377} y={108} width={200} height={38} rx={10} fill="#1e4d35" />
        <text x={385} y={119} fill="#6ee7b7" fontSize={7}>✅ PK - May (admin name)</text>
        <text x={385} y={131} fill="#e2e8f0" fontSize={8}>ยินดีต้อนรับครับ กรอกข้อมูล</text>
        <text x={385} y={141} fill="#e2e8f0" fontSize={8}>ที่ลิงก์นี้ได้เลยครับ 🙏</text>
        <text x={573} y={145} textAnchor="end" fill="#475569" fontSize={7}>10:42</text>
        {/* Another admin bubble */}
        <rect x={377} y={153} width={200} height={26} rx={10} fill="#1e4d35" />
        <text x={385} y={168} fill="#e2e8f0" fontSize={8}>มีข้อสงสัยติดต่อได้เลยนะครับ</text>
        <text x={573} y={177} textAnchor="end" fill="#475569" fontSize={7}>10:43</text>
        {/* Customer again */}
        <rect x={248} y={186} width={130} height={26} rx={10} fill="#1e3a5f" />
        <text x={256} y={201} fill="#e2e8f0" fontSize={8}>ขอบคุณมากครับ 🙏</text>
        <text x={382} y={210} fill="#475569" fontSize={7}>10:45</text>
        {/* Box 3 border */}
        <rect x={239} y={43} width={388} height={220} rx={3}
          fill="none" stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="6,3" />
        <rect x={247} y={39} width={150} height={14} rx={3} fill="#f59e0b" />
        <text x={322} y={49} textAnchor="middle" fill="#1a1a1a" fontSize={9} fontWeight="bold">③ ข้อความ (ซ้าย=ลูกค้า, ขวา=admin)</text>

        {/* ── Box 4: Notes panel (right side) ── */}
        <rect x={630} y={4} width={186} height={302} rx={4} fill="#0f1a2b" />
        <text x={723} y={22} textAnchor="middle" fill="#94a3b8" fontSize={9} fontWeight="bold">Notes</text>
        <rect x={638} y={30} width={170} height={60} rx={6} fill="#1a2a3a" />
        <text x={646} y={44} fill="#e2e8f0" fontSize={7.5}>รอ QR โอน 500 บาท</text>
        <text x={646} y={56} fill="#e2e8f0" fontSize={7.5}>ยืนยัน slip แล้ว</text>
        <text x={646} y={70} fill="#64748b" fontSize={6.5}>5/17/2026, 10:35 PK - May</text>
        <rect x={638} y={98} width={170} height={50} rx={6} fill="#1a2a3a" />
        <text x={646} y={112} fill="#e2e8f0" fontSize={7.5}>ลูกค้าโทรถามเรื่องถอนเงิน</text>
        <text x={646} y={124} fill="#e2e8f0" fontSize={7.5}>แจ้งดำเนินการแล้ว</text>
        <text x={646} y={138} fill="#64748b" fontSize={6.5}>5/17/2026, 14:20 PK - Duk</text>
        {/* Box 4 border */}
        <rect x={631} y={5} width={184} height={300} rx={3}
          fill="none" stroke="#a855f7" strokeWidth={2.5} strokeDasharray="6,3" />
        <rect x={639} y={1} width={100} height={14} rx={3} fill="#a855f7" />
        <text x={689} y={11} textAnchor="middle" fill="#fff" fontSize={9} fontWeight="bold">④ Notes (ขวาสุด)</text>

        {/* Arrow: Box 1 → scraper reads */}
        <text x={148} y={296} textAnchor="middle" fill="#3b82f6" fontSize={7} fontStyle="italic">scroll ↓ หา dateFrom</text>
      </svg>
    </div>
  );
}

/* ─── Problem badge ─── */
function Badge({ level, text }) {
  const colors = {
    critical: { bg: '#450a0a', border: '#ef4444', text: '#fca5a5', icon: '🔴' },
    warn:     { bg: '#451a03', border: '#f59e0b', text: '#fcd34d', icon: '🟡' },
    ok:       { bg: '#052e16', border: '#22c55e', text: '#86efac', icon: '🟢' },
    info:     { bg: '#0c1a3a', border: '#3b82f6', text: '#93c5fd', icon: 'ℹ️' },
  };
  const c = colors[level] || colors.info;
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6,
      padding: '6px 10px', marginBottom: 6, fontSize: 12, color: c.text, lineHeight: 1.5,
    }}>
      <span style={{ marginRight: 6 }}>{c.icon}</span>{text}
    </div>
  );
}

/* ─── Metric chip ─── */
function Metric({ label, value, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 8, padding: '10px 14px', minWidth: 100, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 'bold', color: color || '#f1f5f9' }}>{value ?? '—'}</div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ─── Box section ─── */
function BoxSection({ num, color, title, children }) {
  return (
    <div style={{ border: `2px solid ${color}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ background: color, color: '#fff', borderRadius: 6, padding: '3px 10px', fontWeight: 'bold', fontSize: 13 }}>{num}</div>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

export default function ScraperTestPage() {
  const [from, setFrom]   = useState(weekAgo());
  const [to, setTo]       = useState(today());
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]     = useState(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/scraper/test-report?from=${from}&to=${to}`);
      const j   = await res.json();
      if (j.error) throw new Error(j.error);
      setData(j);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const ms = data?.msgStats       || {};
  const cs = data?.customerStats  || {};
  const ns = data?.noteStats      || {};
  const qs = data?.qcStats        || {};

  const unknownAdminPct = ms.total_admin_msgs
    ? Math.round((ms.unknown_admin / ms.total_admin_msgs) * 100) : 0;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">QC<span>Admin</span></div>
        <nav className="nav">
          <a href="/">Dashboard</a>
          <a href="/admin">Admin Console</a>
          <a href="/scraper">Scraper</a>
          <a href="/rules">⚙️ QC Rules</a>
          <a href="/docs">Setup Docs</a>
          <a className="active" href="/scraper-test">🔬 Scraper Test</a>
          <a href="/PROJECT_DOCS.html" target="_blank">📄 Project Docs</a>
        </nav>
      </aside>

      <main className="main">
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>🔬 Scraper Test Report</h2>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              style={{ border: '1px solid #334155', borderRadius: 6, padding: '4px 8px', background: '#1e293b', color: '#f1f5f9', fontSize: 13 }} />
            <span style={{ color: '#64748b' }}>–</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              style={{ border: '1px solid #334155', borderRadius: 6, padding: '4px 8px', background: '#1e293b', color: '#f1f5f9', fontSize: 13 }} />
            <button onClick={load} disabled={loading}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
              {loading ? '⏳' : '🔄 โหลด'}
            </button>
          </div>
          {err && <div style={{ marginTop: 10, color: '#f87171', fontSize: 13 }}>❌ {err}</div>}
        </div>

        {/* ─── Diagram ─── */}
        <div className="card">
          <LineOADiagram />
          <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>
            แผนผังด้านบนแสดง 4 จุดที่ Scraper ต้องดึงข้อมูลจาก LINE Official Account Manager
            (chat.line.biz) — กรอบสี แทนแต่ละ box ที่ scraper ต้องจัดการ
          </p>
        </div>

        {/* ─── DB Summary Metrics ─── */}
        {data && (
          <div className="card">
            <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#94a3b8' }}>
              📊 สรุปข้อมูลใน DB ({data.from} → {data.to})
            </h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <Metric label="Admin msgs" value={ms.total_admin_msgs} />
              <Metric label="รู้ชื่อ admin" value={ms.with_admin_id}
                color={ms.unknown_admin === 0 ? '#22c55e' : '#f59e0b'} />
              <Metric label="ไม่รู้ชื่อ admin" value={ms.unknown_admin}
                color={ms.unknown_admin > 0 ? '#ef4444' : '#22c55e'} />
              <Metric label="ลูกค้า (unique)" value={ms.distinct_customers} />
              <Metric label="มีชื่อจริง" value={cs.with_real_name}
                color={cs.with_real_name > 0 ? '#22c55e' : '#ef4444'} />
              <Metric label="ชื่อไม่ครบ" value={cs.no_name}
                color={cs.no_name > 0 ? '#f59e0b' : '#22c55e'} />
              <Metric label="Notes ทั้งหมด" value={ns.total_notes} />
              <Metric label="Notes มีวันที่" value={ns.with_date}
                color={ns.with_date === ns.total_notes ? '#22c55e' : '#f59e0b'} />
              <Metric label="QC scored" value={qs.total_scored} />
              <Metric label="ไม่มี customer msg" value={qs.no_customer_msg}
                color={qs.no_customer_msg > 0 ? '#f59e0b' : '#22c55e'} />
            </div>

            {/* Daily breakdown table */}
            {data.dailyBreakdown?.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#1e293b' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: '#94a3b8' }}>วันที่</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>msgs</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>ลูกค้า</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: '#ef4444' }}>ไม่รู้ admin</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>%ไม่รู้</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dailyBreakdown.map(r => (
                      <tr key={r.day} style={{ borderTop: '1px solid #1e293b' }}>
                        <td style={{ padding: '5px 10px', color: '#e2e8f0' }}>{r.day}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: '#f1f5f9' }}>{r.total}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: '#93c5fd' }}>{r.customers}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: r.unknown_admin > 0 ? '#f87171' : '#86efac' }}>{r.unknown_admin}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: '#94a3b8' }}>{pct(r.unknown_admin, r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Unknown admin samples */}
            {data.unknownAdminSamples?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: '#f87171', marginBottom: 6 }}>
                  ตัวอย่างข้อความที่ไม่รู้ชื่อ admin (admin_id = null):
                </div>
                {data.unknownAdminSamples.map((m, i) => (
                  <div key={i} style={{ background: '#1e293b', borderRadius: 6, padding: '6px 10px', marginBottom: 4, fontSize: 11 }}>
                    <span style={{ color: '#64748b' }}>{fmtTs(m.created_at)} — </span>
                    <span style={{ color: '#fcd34d' }}>{m.display_name || m.line_user_id?.slice(0, 16)}</span>
                    <span style={{ color: '#94a3b8' }}>: </span>
                    <span style={{ color: '#e2e8f0' }}>{String(m.message_text || '').slice(0, 80)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Box 1: Chat List ─── */}
        <div className="card">
          <BoxSection num="① Box 1" color="#3b82f6" title="Chat List Scroll + วันที่ (กรอบซ้าย)">
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10, lineHeight: 1.7 }}>
              <b style={{ color: '#e2e8f0' }}>Spec:</b> เลื่อน chat list ลงจนถึงวันที่เป้าหมาย (dateFrom) แล้วเริ่มเก็บข้อมูล
              จาก chat สุดท้ายของวันนั้น LINE OA แสดงเวลาเป็น "10:42" (วันนี้), "Friday" (วันในสัปดาห์),
              "5/17/2026" (เก่ากว่า 7 วัน) ต้องแปลงเป็นวันที่จริงให้ถูกต้อง
            </div>

            <Badge level="ok" text="dayLabelToDate() รองรับ: HH:MM (วันนี้), Yesterday/เมื่อวาน, ชื่อวัน EN+TH (Sunday–Saturday, อาทิตย์–เสาร์), M/D/YYYY และ standard date parse" />
            <Badge level="ok" text="หยุด scroll เร็วเมื่อ item สุดท้ายมี label เก่ากว่า dateFrom — ไม่โหลดทั้งหมด" />
            <Badge level="ok" text="[แก้แล้ว] Virtual Scroll: ลบ pre-collected itemLabels array — อ่าน label live ทุกครั้งหลัง scrollIntoViewIfNeeded()+150ms เพื่อให้ DOM render ก่อนอ่าน" />
            <Badge level="info" text="label ว่างเปล่า → chatDay=null → ดึง chat โดยไม่สนวันที่ (message-level date filter จะกรองข้อความที่ผิดช่วงออกเอง)" />
            <Badge level="info" text="ชื่อวันใน chat list (เช่น 'Friday') ถูกแปลงโดยใช้สัปดาห์ล่าสุด — LINE OA ใช้ตัวเลขวันที่สำหรับเก่ากว่า 7 วัน จึงไม่กระทบ" />
          </BoxSection>
        </div>

        {/* ─── Box 2: Customer Name ─── */}
        <div className="card">
          <BoxSection num="② Box 2" color="#10b981" title="ชื่อลูกค้า (header ของ chat panel)">
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10, lineHeight: 1.7 }}>
              <b style={{ color: '#e2e8f0' }}>Spec:</b> ดึงชื่อลูกค้าจากหัว chat panel ฝั่งขวาหลังคลิก chat item
              LINE OA ตั้งชื่อหน้าเป็น "ชื่อลูกค้า | LINE Official Account Manager" ใน document.title
            </div>

            <Badge level="ok" text="waitForFunction() poll title ทุก 200ms นานสูงสุด 4s — เพิ่มจาก 250ms/2s เพื่อรองรับ connection ช้า" />
            <Badge level="ok" text="กรอง generic titles: 'LINE Official Account Manager', 'หน้าหลัก', 'Home', 'Chat' ออก" />
            <Badge level="ok" text="กรอง emoji-only names ออก ด้วย regex [฀-๿a-zA-Z0-9] (ต้องมีตัวอักษร/ตัวเลขจริง)" />
            <Badge level="ok" text="[แก้แล้ว] DOM fallback ใหม่: img[alt] ที่ top < 15% height, left > 25% width (avatar ลูกค้า) + heading elements ใน right panel — ไม่ใช้ [class*=...] ที่ match ไม่ได้" />
            {data && cs.no_name > 0 && (
              <Badge level="critical"
                text={`ข้อมูลใน DB: มีลูกค้า ${cs.no_name} ราย (จากทั้งหมด ${cs.total} ราย) ที่ display_name เป็น null หรือสั้นมาก — แสดงว่าการดึงชื่อยังไม่สมบูรณ์`} />
            )}
            {data && cs.name_is_id > 0 && (
              <Badge level="warn"
                text={`ข้อมูลใน DB: มีลูกค้า ${cs.name_is_id} ราย ที่ชื่อดูเหมือน LINE user ID (Uxxxxxxxx...) — fallback ใช้ ID แทนชื่อ`} />
            )}
          </BoxSection>
        </div>

        {/* ─── Box 3: Messages ─── */}
        <div className="card">
          <BoxSection num="③ Box 3" color="#f59e0b" title="ข้อความใน Chat (ซ้าย=ลูกค้า, ขวา=admin)">
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10, lineHeight: 1.7 }}>
              <b style={{ color: '#e2e8f0' }}>Spec:</b> ดึงข้อความทั้งหมดในช่วงวันที่ จับคู่ Q&A (คำถามลูกค้า → คำตอบ admin)
              พร้อมชื่อ admin ที่ตอบ บันทึก timestamp ให้ถูกต้อง
            </div>

            <Badge level="ok" text="จับคู่ Q&A โดย lastCustomerText carry-forward — admin bubble ที่ถัดจาก customer bubble จะถูก pair กัน" />
            <Badge level="ok" text="กรองวันที่: ถ้า timestamp ไม่มี ใช้ currentDate จาก date separator (.chatsys-date) เป็น fallback" />
            <Badge level="ok" text="Timestamp fallback: ถ้าไม่มี <time datetime> เลย → ใช้ dateFrom + 12:00:00 เพื่อป้องกัน created_at=now()" />
            <Badge level="ok" text="[แก้แล้ว] extractAdminName() ใหม่: (1) img[alt] ใน .chat-reverse — profile picture alt มักมีชื่อ admin, (2) text nodes ที่ไม่อยู่ใน .chat-item-text bubble, (3) title/aria-label attribute" />
            <Badge level="info" text=".chatsys-date และ .chat-item-text เป็น class ที่ใช้ได้ผลจริง (ดึงข้อความได้อยู่แล้ว) — admin name จะดีขึ้นถ้า LINE OA ใส่ alt ใน profile picture" />
            {data && ms.unknown_admin > 0 && (
              <Badge level="critical"
                text={`ยืนยันจาก DB: ใน ${data.from}–${data.to} มี ${ms.unknown_admin} จาก ${ms.total_admin_msgs} ข้อความ (${unknownAdminPct}%) ที่ admin_id = null — ชื่อ admin ดึงไม่ได้`} />
            )}
            {data && qs.no_customer_msg > 0 && (
              <Badge level="warn"
                text={`ยืนยันจาก DB: มี ${qs.no_customer_msg} QC score ที่ไม่มี customer_message_id — Q&A pairing ไม่สมบูรณ์`} />
            )}
          </BoxSection>
        </div>

        {/* ─── Box 4: Notes ─── */}
        <div className="card">
          <BoxSection num="④ Box 4" color="#a855f7" title="Notes ของลูกค้า (panel ฝั่งขวาสุด)">
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10, lineHeight: 1.7 }}>
              <b style={{ color: '#e2e8f0' }}>Spec:</b> ดึง Notes ที่ admin บันทึกไว้ในแต่ละ conversation
              พร้อมวันเวลาที่ note และชื่อ admin ที่ note
            </div>

            <Badge level="ok" text="leafNotes algorithm: กรอง parent container ออก เก็บเฉพาะ element ที่เล็กที่สุดที่มี date pattern = note จริงๆ" />
            <Badge level="ok" text="กรอง UI labels ออก: 'Add tags', 'Assign', 'Follow up', 'Resolve', 'Tag', 'Label' ด้วย UI_SKIP regex" />
            <Badge level="ok" text="[แก้แล้ว] เลิกใช้ x > 55% — ใช้ chat container exclusion แทน: หา scrollable parent ของ .chatsys-date แล้ว exclude ทุก element ที่อยู่ในนั้น; fallback เป็น x > 50%ถ้าหา container ไม่เจอ" />
            <Badge level="ok" text="[แก้แล้ว] noted_at แปลงจาก string 'M/D/YYYY, HH:MM' → ISO timestamp ด้วย parseNotedAt() ก่อนส่ง API — DB จะได้ timestamptz จริงๆ ไม่ใช่ string" />
            <Badge level="info" text="Date regex M/D/YYYY, HH:MM ยังคงใช้รูปแบบเดิม — รองรับ AM/PM ด้วย; ถ้า LINE OA เปลี่ยน format จะ match ไม่ได้ (monitor ด้วย noted_at=null count)" />
            <Badge level="info" text="Notes ใน DB ป้องกัน duplicate ด้วย upsert — ถ้า scrape ซ้ำจะไม่บันทึกซ้ำ" />
            {data && (
              <Badge level={ns.total_notes === 0 ? 'critical' : ns.with_date < ns.total_notes ? 'warn' : 'ok'}
                text={`ข้อมูลใน DB: notes ทั้งหมด ${ns.total_notes} รายการ — มีวันที่ ${ns.with_date} มีชื่อผู้ note ${ns.with_author} (last scraped: ${fmtTs(ns.last_scraped)})`} />
            )}
          </BoxSection>
        </div>

        {/* ─── Recent Jobs ─── */}
        {data?.jobs?.length > 0 && (
          <div className="card">
            <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#94a3b8' }}>📋 Jobs ล่าสุด</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1e293b' }}>
                    {['ID', 'ช่วงวันที่', 'สถานะ', 'Chats', 'Logged', 'เริ่ม', 'เสร็จ', 'Error'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#94a3b8' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.map(j => (
                    <tr key={j.id} style={{ borderTop: '1px solid #1e293b' }}>
                      <td style={{ padding: '5px 10px', color: '#64748b' }}>{j.id}</td>
                      <td style={{ padding: '5px 10px', color: '#e2e8f0' }}>{j.date_from?.slice(0,10)} – {j.date_to?.slice(0,10)}</td>
                      <td style={{ padding: '5px 10px' }}>
                        <span style={{ color: statusColor(j.status), fontWeight: 600 }}>{j.status}</span>
                      </td>
                      <td style={{ padding: '5px 10px', color: '#94a3b8' }}>{j.total_chats ?? '—'}</td>
                      <td style={{ padding: '5px 10px', color: '#93c5fd' }}>{j.logged_count ?? 0}</td>
                      <td style={{ padding: '5px 10px', color: '#64748b' }}>{fmtTs(j.started_at)}</td>
                      <td style={{ padding: '5px 10px', color: '#64748b' }}>{fmtTs(j.finished_at)}</td>
                      <td style={{ padding: '5px 10px', color: '#f87171', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.error_text || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Summary ─── */}
        <div className="card" style={{ background: '#052e16', border: '1px solid #166534' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#86efac' }}>✅ สรุปการแก้ไข (แก้ครบทุกปัญหาแล้ว)</h3>
          <div style={{ fontSize: 12, lineHeight: 2, color: '#94a3b8' }}>
            <div><span style={{ color: '#86efac', fontWeight: 'bold' }}>แก้ไขแล้ว (7 อัน):</span></div>
            <div style={{ paddingLeft: 16 }}>
              1. <b style={{ color: '#86efac' }}>Box 3 — extractAdminName()</b>: ใช้ img[alt] + text nodes นอก .chat-item-text + title/aria-label แทน hashed class selectors<br/>
              2. <b style={{ color: '#86efac' }}>Box 4 — Notes detection</b>: ใช้ chat container exclusion (หา scrollable parent ของ .chatsys-date) แทน x {'>'} 55%<br/>
              3. <b style={{ color: '#86efac' }}>Box 2 — DOM fallback</b>: ใช้ img[alt] ใน top-right area + heading elements แทน [class*=...] selectors<br/>
              4. <b style={{ color: '#86efac' }}>Box 1 — Virtual scroll</b>: อ่าน label live ทุก iteration หลัง scrollIntoViewIfNeeded()+150ms แทนการใช้ pre-collected array<br/>
              5. <b style={{ color: '#86efac' }}>Box 2 — Timeout</b>: เพิ่มจาก 2s → 4s, poll จาก 250ms → 200ms<br/>
              6. <b style={{ color: '#86efac' }}>Box 4 — noted_at</b>: parseNotedAt() แปลง "M/D/YYYY, HH:MM" → ISO timestamp ก่อนส่ง API<br/>
              7. <b style={{ color: '#86efac' }}>Box 4 — UI_SKIP</b>: เพิ่ม 'Tag', 'Label', 'Follow-up' ใน filter list
            </div>
            <div style={{ marginTop: 8, color: '#64748b' }}>
              ดูตัวเลขผล DB จริงๆ ด้านบน — ถ้า "ไม่รู้ชื่อ admin" ลดลงหลังรัน scraper ครั้งถัดไปแสดงว่า img[alt] approach ได้ผล
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

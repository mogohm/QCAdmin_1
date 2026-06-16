"use client";
import AppShell from "../components/AppShell";

const code = (s) => (
  <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, fontSize: 13, fontFamily: "monospace" }}>
    {s}
  </code>
);
const pre = (s) => (
  <pre
    style={{
      background: "#1e293b",
      color: "#e2e8f0",
      borderRadius: 8,
      padding: "14px 16px",
      overflowX: "auto",
      fontSize: 13,
      lineHeight: 1.6,
      margin: "8px 0 0",
    }}
  >
    {s}
  </pre>
);

export default function Docs() {
  return (
    <AppShell title="คู่มือระบบ QC Admin" subtitle="สถาปัตยกรรม · QC Engine v4 · การใช้งานประจำวัน">
      <article className="card" style={{ maxWidth: 860, lineHeight: 1.8 }}>
        <p style={{ color: "#6b7280", marginTop: 0 }}>อัปเดตล่าสุด มิถุนายน 2026 — QC Engine v4 (SOP-driven)</p>

        {/* Architecture */}
        <h2>🏗️ ภาพรวมระบบ (Pipeline)</h2>
        <p>เมื่อแอดมินตอบลูกค้า ระบบจะให้คะแนนอัตโนมัติผ่าน {code("runQc()")}:</p>
        {pre(`Customer message ─► Admin reply (scraper / Admin Console)
   └─► runQc(): detectIntent ─► matchSOP ─► QC Engine v4 (8 มิติ)
        ─► qc_scores + qc_score_details ─► Telegram alert (fail/fatal)
   Dashboard / Chat Review อ่านจาก qc_score_details
   Dispute ─► Manager approve/reject ─► Commission`)}
        <p style={{ color: "#6b7280" }}>
          ข้อความที่แอดมินตอบจาก LINE OA Manager โดยตรงไม่ถูกส่งกลับเป็น webhook → ใช้ <b>Scraper</b> ดึงออกมา
          (กรองเฉพาะชื่อขึ้นต้น <b>PK</b>) หรือให้แอดมินตอบผ่าน {code("/admin")}
        </p>

        {/* QC Engine */}
        <h2>1. QC Engine v4 — เกณฑ์ให้คะแนน</h2>
        <p>rubric ถ่วงน้ำหนักคงที่ มิติที่ไม่เกี่ยวกับ intent = N/A (ไม่คิดในตัวหาร):</p>
        <ul>
          <li>
            Greeting &amp; Closing <b>15</b> · Problem Solving &amp; Accuracy <b>20</b> · Communication &amp; Tone{" "}
            <b>20</b> · Response Time <b>10</b>
          </li>
          <li>Upselling 10 (promotion/bonus) · Credit Deposit/Withdraw 10 (ฝาก/ถอน) · KYC 10 (kyc)</li>
          <li>
            <b>Minor</b> (ไม่มีคำลงท้ายสุภาพ/ตอบสั้น/ส่งซ้ำ) → −5 · <b>Fatal</b>{" "}
            (หยาบ/โทษลูกค้า/รับประกันผลพนัน/ปฏิเสธช่วยเหลือ) → 0
          </li>
          <li>
            <b>SLA exception</b>: มี System Event ครอบเวลานั้น → response time ไม่หักเต็ม (floor 80)
          </li>
        </ul>
        <p>
          แต่ละมิติเก็บ <b>evidence</b> (keyword ที่เจอ/ขาด, similarity, เวลาตอบ) ลง {code("qc_score_details")}{" "}
          เพื่อใช้ใน dashboard และ dispute
        </p>

        {/* SOP */}
        <h2>2. SOP Knowledge Base</h2>
        <ol>
          <li>
            import SOP จาก Excel: {code("POST /api/admin/import-sop")} (x-api-key) หรือ {code("npm run import:sop")}
          </li>
          <li>จัดการที่หน้า {code("/sop")} — ค้นหา, แก้ไข keyword/required/forbidden, ดู used_count + coverage</li>
          <li>ปิดใช้งานชั่วคราว = ปุ่ม ON/off (soft) · ลบถาวร = ปุ่มลบ ({code("?hard=true")})</li>
          <li>
            ตรวจคุณภาพข้อมูล: {code("npm run audit:sop")} (duplicate / empty answer / missing keyword / never-matched)
          </li>
        </ol>

        {/* Dispute */}
        <h2>3. Dispute (โต้แย้งผล AI)</h2>
        <ol>
          <li>แอดมินกดโต้แย้งเคส → สร้าง {code("qc_disputes")} (status pending) + Telegram แจ้ง</li>
          <li>เข้า {code("/disputes")} → Manager ดูคำถาม/คำตอบ/เหตุผล AI/มิติที่ตก → ใส่คะแนนใหม่</li>
          <li>อนุมัติ + แก้คะแนน → อัปเดต {code("qc_scores.final_score")} (สะท้อนใน commission)</li>
        </ol>
        <p style={{ color: "#6b7280" }}>เฉพาะ manager/admin เท่านั้นที่ approve/reject ได้</p>

        {/* System Events */}
        <h2>4. System Events (SLA exception)</h2>
        <p>
          บันทึกช่วงระบบ/ธนาคารล่มที่ {code("/system-events")} — ติ๊ก affects_sla + ระบุช่วงเวลา →
          เคสที่ตอบช้าในช่วงนั้นจะไม่ถูกหัก response time เต็ม
        </p>

        {/* Commission */}
        <h2>5. Commission</h2>
        <ul>
          <li>Tier ตามคะแนน: 90–100 ×1.2 Excellent · 80–89 ×1.0 Standard · 70–79 ×0.5 Warning · &lt;70 ×0 Critical</li>
          <li>commission = upsell × 1% × multiplier (รวม dispute adjustment + fatal penalty)</li>
          <li>
            หน้า {code("/commission")} — override ได้, export CSV, กด Save → snapshot ลง {code("admin_commissions")}
          </li>
        </ul>

        {/* Dashboard */}
        <h2>6. Dashboard ใหม่</h2>
        <p>
          Executive Dashboard ({code("/")}) ดึงจาก API เดียว ({code("/api/dashboard")}) แบบ parallel:
        </p>
        <ul>
          <li>KPI ext 11 ตัว (avg score, coverage, SLA pass, fatal/minor, pending disputes, est. commission)</li>
          <li>Category Breakdown — มาจาก {code("qc_score_details")} จริง (pass rate / fail count / top fail reason)</li>
          <li>QA trend, SOP coverage (matched/unmatched), intent distribution, ranking, pending reply</li>
        </ul>

        {/* Roles */}
        <h2>7. บทบาทผู้ใช้ &amp; Login</h2>
        <p>เข้าที่ {code("/login")} (session HMAC cookie อายุ 7 วัน — หมดอายุเด้งกลับ login อัตโนมัติ)</p>
        <ul>
          <li>
            <b>manager</b> — ทุกหน้า + อนุมัติ dispute + จัดการ SOP
          </li>
          <li>
            <b>marketing</b> — dashboard / commission / performance
          </li>
          <li>
            <b>admin (PK)</b> — ดูคะแนนตัวเอง + โต้แย้งของตัวเอง
          </li>
        </ul>
        <p style={{ color: "#6b7280" }}>
          seed บัญชี: {code("POST /api/auth/setup")} → manager/manager123, marketing/marketing123, &lt;slug&gt;/pk1234
          (เปลี่ยนรหัสก่อนใช้จริง)
        </p>

        {/* Tests */}
        <h2>8. Test Commands (ล่าสุด)</h2>
        {pre(`npm run build              # build (46 routes)
npm run test:qc            # QC engine 31 checks (offline)
npm run test:qc-accuracy   # ชุดเคสจริง 34 cases
npm run test:admin-import  # PK admin detection 32
npm run test:admin-reply   # runQc + qc_score_details 24
npm run test:dashboard-api # /api/dashboard + SOP CRUD live (ตั้ง ADMIN_API_KEY)
npm run audit:sop          # คุณภาพข้อมูล SOP
npm run uat:check          # รวมทั้งหมด (ต้องมี ADMIN_API_KEY)`)}

        {/* ENV */}
        <h2>📋 Environment Variables</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>Key</th>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>ที่ใช้</th>
              <th style={{ padding: "8px 12px", textAlign: "center" }}>จำเป็น</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["DATABASE_URL", "Neon Postgres connection", "✅"],
              ["ADMIN_API_KEY", "auth scraper/admin + guard read API", "✅"],
              ["SESSION_SECRET", "เซ็น session cookie (fallback → ADMIN_API_KEY)", "แนะนำ"],
              ["LINE_CHANNEL_ACCESS_TOKEN", "ส่งข้อความ + ดึงโปรไฟล์", "✅*"],
              ["LINE_CHANNEL_SECRET", "verify webhook signature", "✅*"],
              ["TELEGRAM_BOT_TOKEN / CHAT_ID", "แจ้งเตือน QC (ปิดเงียบถ้าไม่ตั้ง)", "—"],
              ["QC_RESPONSE_LIMIT_MINUTES", "เกณฑ์ SLA (default 5)", "—"],
            ].map(([k, d, r], i) => (
              <tr key={i} style={{ borderTop: "1px solid #e5e7eb" }}>
                <td style={{ padding: "8px 12px", fontFamily: "monospace", fontWeight: 600 }}>{k}</td>
                <td style={{ padding: "8px 12px", color: "#374151" }}>{d}</td>
                <td style={{ padding: "8px 12px", textAlign: "center" }}>{r}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "#6b7280", marginTop: 16 }}>
          เอกสารฉบับเต็ม: docs/DEPLOYMENT.md · docs/UAT_CHECKLIST.md · docs/OPERATION_MANUAL.md
        </p>
      </article>
    </AppShell>
  );
}

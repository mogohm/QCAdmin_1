"use client";
import AppShell from "../components/AppShell";

const code = (s) => (
  <code
    style={{
      background: "#f1f5f9",
      padding: "2px 6px",
      borderRadius: 4,
      fontSize: 13,
      fontFamily: "monospace",
    }}
  >
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
    <AppShell
      title="Project Docs"
      subtitle="คู่มือระบบ QC Admin ปัจจุบัน — QC Engine v4 (SOP-driven)"
    >
      <article className="card" style={{ maxWidth: 860, lineHeight: 1.8 }}>
        <p style={{ color: "#6b7280", marginTop: 0 }}>
          อัปเดตล่าสุด มิถุนายน 2026
        </p>

        {/* 1. QC Engine v4 */}
        <h2>1. QC Engine v4</h2>
        <p>
          ให้คะแนนการตอบของแอดมินอัตโนมัติผ่าน {code("runQc()")}: detectIntent →
          matchSOP → rubric 8 มิติ → บันทึก {code("qc_scores")} +{" "}
          {code("qc_score_details")} → Telegram alert (fail/fatal)
        </p>
        <ul>
          <li>
            น้ำหนักคงที่: Greeting &amp; Closing <b>15</b> · Problem Solving
            &amp; Accuracy <b>20</b> · Communication &amp; Tone <b>20</b> ·
            Response Time <b>10</b>
          </li>
          <li>
            intent-specific: Upselling 10 (promotion/bonus) · Credit
            Deposit/Withdraw 10 (ฝาก/ถอน) · KYC 10 (kyc)
          </li>
          <li>
            มิติที่ไม่เกี่ยวกับ intent = N/A (ไม่คิดในตัวหาร) แต่บันทึกเหตุผลไว้
          </li>
          <li>
            <b>Minor</b> (ไม่มีคำลงท้ายสุภาพ/ตอบสั้น/ส่งซ้ำ) → −5 · <b>Fatal</b>{" "}
            (หยาบ/โทษลูกค้า/รับประกันผลพนัน/ปฏิเสธช่วยเหลือ) → 0
          </li>
          <li>
            <b>SLA exception</b>: มี System Event ครอบเวลานั้น → response time
            floor 80
          </li>
          <li>
            แต่ละมิติเก็บ evidence (keyword ที่เจอ/ขาด, similarity, เวลาตอบ) ลง{" "}
            {code("qc_score_details")}
          </li>
        </ul>

        {/* 2. SOP Import */}
        <h2>2. SOP Import</h2>
        <ol>
          <li>
            import จาก Excel เข้า {code("sop_scripts")}:{" "}
            {code("POST /api/admin/import-sop")} (x-api-key) หรือ{" "}
            {code("npm run import:sop")}
          </li>
          <li>
            แต่ละ SOP: topic, question, answer, intent, keywords,
            required_keywords, forbidden_keywords, escalation
          </li>
          <li>
            ตรวจคุณภาพข้อมูล: {code("npm run audit:sop")} (duplicate topics /
            empty answer / missing keyword / category mismatch / never-matched)
          </li>
        </ol>

        {/* 3. SOP Manager */}
        <h2>3. SOP Manager</h2>
        <ol>
          <li>
            จัดการที่หน้า {code("/sop")} — ค้นหา, filter ตาม intent, แก้ไข
            keyword/required/forbidden ผ่าน drawer
          </li>
          <li>
            ดู {code("used_count")} + {code("last_matched_at")} + coverage badge
            + คำเตือน missing required keyword
          </li>
          <li>
            ปิดใช้งานชั่วคราว = ปุ่ม ON/off (soft, {code("is_active=false")}) ·
            ลบถาวร = {code("?hard=true")}
          </li>
          <li>
            สิทธิ์แก้ไข/ลบ: admin/manager เท่านั้น ({code("/api/sop")},{" "}
            {code("/api/sop/:id")})
          </li>
        </ol>

        {/* 4. Dispute Review */}
        <h2>4. Dispute Review</h2>
        <ol>
          <li>
            แอดมินกดโต้แย้งเคส → สร้าง {code("qc_disputes")} (status pending) +
            Telegram แจ้ง
          </li>
          <li>
            เข้า {code("/disputes")} → Manager ดูคำถาม/คำตอบ/เหตุผล AI/มิติที่ตก
            → ใส่คะแนนใหม่
          </li>
          <li>
            อนุมัติ + แก้คะแนน → อัปเดต {code("qc_scores.final_score")}{" "}
            (สะท้อนใน commission)
          </li>
          <li>สิทธิ์ approve/reject: manager/admin เท่านั้น</li>
        </ol>

        {/* 5. System Events */}
        <h2>5. System Events</h2>
        <p>
          บันทึกช่วงระบบ/ธนาคารล่มที่ {code("/system-events")} — ติ๊ก{" "}
          {code("affects_sla")} + ระบุช่วงเวลา → เคสที่ตอบช้าในช่วงนั้น response
          time จะไม่ถูกหักเต็ม (floor 80) ตรวจผ่าน {code("isSlaException()")} ใน
          qc-runner
        </p>

        {/* 6. Admin Performance */}
        <h2>6. Admin Performance</h2>
        <p>หน้า {code("/admin-performance")} แสดงผลงานรายแอดมิน:</p>
        <ul>
          <li>
            Category Heatmap — คะแนนเฉลี่ยรายมิติต่อแอดมิน (เขียว→แดงตามคะแนน)
          </li>
          <li>
            Ranking — เรียงตามคะแนนเฉลี่ย + จำนวนเคส + เวลาตอบ + จำนวน bad
          </li>
          <li>
            Coaching Needed — แอดมินที่มีมิติต่ำกว่า 70 (ระบุมิติที่ต้องโค้ช)
          </li>
          <li>คลิกแถวเพื่อ drilldown + export CSV</li>
        </ul>

        {/* 7. Commission */}
        <h2>7. Commission</h2>
        <ul>
          <li>
            Tier ตามคะแนน: 90–100 ×1.2 Excellent · 80–89 ×1.0 Standard · 70–79
            ×0.5 Warning · &lt;70 ×0 Critical
          </li>
          <li>
            commission = upsell × 1% × multiplier (รวม dispute adjustment +
            fatal penalty)
          </li>
          <li>
            หน้า {code("/commission")} — override ได้, export CSV, กด Save →
            snapshot ลง {code("admin_commissions")}
          </li>
        </ul>

        {/* 8. UAT Commands */}
        <h2>8. UAT Commands</h2>
        {pre(`npm run build              # build (46 routes)
npm run test:qc            # QC engine 31 checks (offline)
npm run test:qc-accuracy   # ชุดเคสจริง 34 cases (intent + pass/fail/fatal)
npm run audit:sop          # คุณภาพข้อมูล SOP
npm run test:admin-import  # PK admin detection 32
npm run test:admin-reply   # runQc + qc_score_details 24
npm run test:scraper       # date label + bubble parser + log-reply (offline)
npm run test:dashboard-api # /api/dashboard + SOP CRUD live (ตั้ง ADMIN_API_KEY)
npm run uat:check          # รวมทั้งหมดตามลำดับด้านบน

# Scraper (LINE OA)
npm run scraper:login      # login LINE OA → .storage/line-auth.json
npm run scraper:watch      # poll job แล้ว scrape ต่อเนื่อง`)}
      </article>
    </AppShell>
  );
}

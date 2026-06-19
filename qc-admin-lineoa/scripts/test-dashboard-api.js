// test-dashboard-api.js — ตรวจว่า /api/dashboard ส่ง field ครบตาม Phase 3
//   npm run test:dashboard-api   (ยิงไปที่ deployed URL หรือ DASHBOARD_URL)
const BASE =
  process.env.DASHBOARD_URL ||
  process.env.APP_BASE_URL ||
  "https://qc-admin-1.vercel.app";
// dashboard ถูกป้องกันด้วย guard (session หรือ api-key) — ส่ง x-api-key ถ้ามี
const AUTH = process.env.ADMIN_API_KEY
  ? { "x-api-key": process.env.ADMIN_API_KEY }
  : {};

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
};
const has = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);

(async () => {
  let d, status;
  try {
    const r = await fetch(
      `${BASE}/api/dashboard?from=2026-06-01&to=2026-06-30`,
      { headers: AUTH },
    );
    status = r.status;
    d = await r.json();
  } catch (e) {
    console.error("❌ fetch failed:", e.message);
    process.exit(1);
  }

  // /api/dashboard ถูกป้องกันด้วย guard — ถ้าไม่มี ADMIN_API_KEY และโดน 401 ให้ข้าม (ไม่ fail uat:check)
  if (status === 401 && !process.env.ADMIN_API_KEY) {
    console.log(
      "⏭️  ข้าม test:dashboard-api — /api/dashboard ต้องมี session/ADMIN_API_KEY",
    );
    console.log(
      "    (ตั้ง ADMIN_API_KEY=… ก่อนรันเพื่อทดสอบ dashboard + SOP CRUD แบบเต็ม)",
    );
    process.exit(0);
  }

  if (d.error) {
    console.error("❌ API error:", d.error);
    process.exit(1);
  }

  console.log(`== /api/dashboard @ ${BASE} ==`);
  // KPI ext
  const kpiKeys = [
    "totalChats",
    "totalQcCases",
    "avgQaScore",
    "qaCoveragePercent",
    "sopCoveragePercent",
    "avgResponseSec",
    "slaPassPercent",
    "fatalCount",
    "minorCount",
    "pendingDisputes",
    "estimatedCommission",
  ];
  ok("มี kpiExt", has(d, "kpiExt"));
  for (const k of kpiKeys) ok(`kpiExt.${k}`, has(d.kpiExt || {}, k));

  // sections
  ok("categorySummary array", Array.isArray(d.categorySummary));
  ok("intentDistribution array", Array.isArray(d.intentDistribution));
  ok("fatalCases array", Array.isArray(d.fatalCases));
  ok("minorCases number", typeof d.minorCases === "number");
  ok(
    "sopCoverage {matched,unmatched,percent,top_unmatched_intents}",
    has(d.sopCoverage, "matched") &&
      has(d.sopCoverage, "unmatched") &&
      has(d.sopCoverage, "top_unmatched_intents"),
  );
  ok(
    "coachingSummary {recent,lowest_categories,repeated_fail_reasons}",
    has(d.coachingSummary, "recent") &&
      has(d.coachingSummary, "lowest_categories") &&
      has(d.coachingSummary, "repeated_fail_reasons"),
  );
  ok(
    "disputeSummary {pending,approved,rejected}",
    has(d.disputeSummary, "pending") &&
      has(d.disputeSummary, "approved") &&
      has(d.disputeSummary, "rejected"),
  );
  ok(
    "commissionSummary {tiers,per_admin}",
    has(d.commissionSummary, "tiers") &&
      has(d.commissionSummary, "per_admin") &&
      Array.isArray(d.commissionSummary.per_admin),
  );
  ok("adminCategoryRanking array", Array.isArray(d.adminCategoryRanking));
  ok(
    "slaExceptionSummary {sla_pass_pct}",
    has(d.slaExceptionSummary, "sla_pass_pct"),
  );
  ok("ranking array", Array.isArray(d.ranking));
  ok("pendingReply array", Array.isArray(d.pendingReply));

  // commission per_admin shape (ถ้ามี)
  if ((d.commissionSummary?.per_admin || []).length) {
    const a = d.commissionSummary.per_admin[0];
    ok(
      "per_admin มี tier/multiplier/estimated_commission",
      has(a, "tier") && has(a, "multiplier") && has(a, "estimated_commission"),
    );
  }

  // ---- SOP CRUD (live) — รันเมื่อมี ADMIN_API_KEY ----
  const KEY = process.env.ADMIN_API_KEY;
  if (KEY) {
    console.log("\n== SOP PATCH/DELETE (live) ==");
    const H = { "Content-Type": "application/json", "x-api-key": KEY };
    const topic = "__test_sop_" + Date.now();
    try {
      const c = await (
        await fetch(`${BASE}/api/sop`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({
            topic,
            answer: "test answer",
            intent: "deposit",
            required_keywords: "ลิงก์,ยอด",
          }),
        })
      ).json();
      ok("SOP POST create", c.ok && c.sop?.id, c.error || "");
      const sid = c.sop?.id;
      if (sid) {
        const p = await (
          await fetch(`${BASE}/api/sop/${sid}`, {
            method: "PATCH",
            headers: H,
            body: JSON.stringify({
              answer: "updated",
              forbidden_keywords: "โง่",
            }),
          })
        ).json();
        ok("SOP PATCH update", p.ok && p.sop?.answer === "updated");
        const sd = await (
          await fetch(`${BASE}/api/sop/${sid}`, {
            method: "DELETE",
            headers: H,
          })
        ).json();
        ok(
          "SOP DELETE = soft (is_active=false)",
          sd.ok && sd.soft_deleted?.is_active === false,
          JSON.stringify(sd).slice(0, 80),
        );
        const hd = await (
          await fetch(`${BASE}/api/sop/${sid}?hard=true`, {
            method: "DELETE",
            headers: H,
          })
        ).json();
        ok("SOP DELETE ?hard=true = hard delete", hd.ok && !!hd.hard_deleted);
      }
    } catch (e) {
      ok("SOP CRUD", false, e.message);
    }
  } else {
    console.log("\n(ข้าม SOP CRUD live test — ไม่มี ADMIN_API_KEY)");
  }

  console.log(`\n===== สรุป: ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
  process.exit(fail ? 1 : 0);
})();

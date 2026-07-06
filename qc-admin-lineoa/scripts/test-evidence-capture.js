// test-evidence-capture.js — ตรวจ Evidence Bundle (upload → gallery API → viewer → fallback)
//   ยิง prod จริง (ต้อง seed + migrate ก่อน). ต้องมี ADMIN_API_KEY เพื่อ upload evidence
const fs = require("fs");
const path = require("path");
const BASE = (
  process.env.AUTH_BASE ||
  process.env.APP_BASE_URL ||
  "https://qc-admin-1.vercel.app"
).replace(/\/$/, "");
const KEY = process.env.ADMIN_API_KEY || process.env.QC_API_KEY || "";
let pass = 0,
  fail = 0,
  skip = 0;
const ok = (n, c, x = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`);
};
const info = (n) => {
  skip++;
  console.log(`⏭️  ${n}`);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
// 1x1 png (base64)
const PNG1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function login(u, p) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: p }),
  });
  const sc = r.headers.get("set-cookie");
  return sc ? sc.split(";")[0] : null;
}
const jget = (p, cookie) =>
  fetch(`${BASE}${p}`, { headers: cookie ? { Cookie: cookie } : {} });

(async () => {
  console.log(`== evidence capture @ ${BASE} ==`);

  // ---- static: EvidenceViewer 4 แท็บ + API มีอยู่ ----
  const ev = read("app/components/EvidenceViewer.js");
  ok("EvidenceViewer มีแท็บ 'ภาพแชทจริง'", /ภาพแชทจริง/.test(ev));
  ok("EvidenceViewer มีแท็บ 'สรุปเคส'", /สรุปเคส/.test(ev));
  ok(
    "EvidenceViewer มีแท็บ 'ข้อมูลดิบ' + lightbox ขยายภาพ",
    /ข้อมูลดิบ/.test(ev) && /zoom/.test(ev),
  );
  ok(
    "EvidenceViewer มี fallback ไม่มีภาพ",
    /ยังไม่มีภาพหลักฐานของหน้าแชท/.test(ev),
  );
  ok(
    "มี /api/evidence route",
    fs.existsSync(path.join(root, "app/api/evidence/route.js")),
  );
  ok(
    "scraper มี captureEvidence + EVIDENCE_CAPTURE_MODE",
    /captureEvidence/.test(read("scraper.js")) &&
      /EVIDENCE_CAPTURE_MODE/.test(read("scraper.js")),
  );

  const sys = await login("sysadmin", "sysadmin123");
  if (!sys) {
    info("ข้าม API tests — login sysadmin ไม่ได้");
    console.log(
      `\n===== Evidence: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} / ข้าม ${skip} =====`,
    );
    process.exit(fail ? 1 : 0);
  }
  if (!KEY) {
    info("ข้าม upload/gallery — ไม่ได้ตั้ง ADMIN_API_KEY");
    console.log(
      `\n===== Evidence: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} / ข้าม ${skip} =====`,
    );
    process.exit(fail ? 1 : 0);
  }

  // ---- flagged manual case → สร้าง qc_scores + evidence (summary_json) ----
  const mc = await fetch(`${BASE}/api/manual-case`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sys },
    body: JSON.stringify({
      customer_name: "EVIDENCE ทดสอบ",
      admin_name: "PK EVID",
      customer_text: "ขอลิงก์ถอนเงินด่วนครับ",
      admin_text: "ไม่ทราบครับ", // คำตอบแย่ → คะแนนต่ำ → flagged
      response_seconds: 600,
      reason: "evidence test",
    }),
  }).then((r) => r.json());
  ok(
    "flagged manual case สร้าง qc_score",
    mc.qc_score_id != null,
    `score ${mc.final_score}`,
  );

  if (mc.qc_score_id) {
    // upload ภาพหลักฐาน (จำลอง scraper) ผูกกับ conversation
    const up = await fetch(`${BASE}/api/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": KEY },
      body: JSON.stringify({
        conversation_id: mc.conversation_id,
        qc_score_id: mc.qc_score_id,
        scraper_job_id: null,
        items: [
          {
            evidence_type: "chat_panel_png",
            title: "หน้าแชทจริง",
            image_base64: PNG1,
          },
          {
            evidence_type: "html_snapshot",
            title: "HTML",
            data: { html: "<div class='chat'>hi</div>" },
          },
        ],
      }),
    });
    const upj = await up.json();
    ok(
      "upload evidence (/api/evidence) สำเร็จ",
      up.status === 200 && upj.saved >= 1,
      `saved ${upj.saved} · storage ${upj.storage} (${(upj.used || []).join(",")})`,
    );

    // gallery API — ตรวจ contract ตรงกับ EvidenceViewer เป๊ะ
    const g = await jget(
      `/api/case-evidence?qc_score_id=${mc.qc_score_id}`,
      sys,
    ).then((r) => r.json());
    ok(
      "case-evidence contract ครบ (summary/screenshots/htmlSnapshots/rawData/timeline/masked)",
      "summary" in g &&
        Array.isArray(g.screenshots) &&
        Array.isArray(g.htmlSnapshots) &&
        Array.isArray(g.rawData) &&
        "timeline" in g &&
        "masked" in g,
    );
    // negative: ต้องไม่ใช่ contract เก่า { evidence: [...] }
    ok("ไม่ใช่ contract เก่า { evidence: [] }", !("evidence" in g));
    const shot = (g.screenshots || [])[0];
    ok("screenshots[0].url ไม่เป็น null", !!shot?.url, shot?.url?.slice(0, 40));
    // production mode: url ต้องเป็น https (blob); โหมด fallback = data URL (ยังแสดงได้)
    const httpsOk = shot?.url?.startsWith("https://");
    const inlineOk = shot?.url?.startsWith("data:image");
    if (process.env.EVIDENCE_STRICT_HTTPS === "true")
      ok(
        "screenshots[0].url เป็น https:// (blob)",
        httpsOk,
        shot?.url?.slice(0, 40),
      );
    else
      ok(
        "screenshots[0].url เป็น https หรือ data URL (แสดงบน UI ได้)",
        httpsOk || inlineOk,
        httpsOk ? "https(blob)" : "data-url(fallback)",
      );
    ok(
      "gallery มี summary (customer/admin/score/timestamps)",
      g.summary &&
        g.summary.admin_text != null &&
        g.summary.final_score != null,
    );
    ok("gallery มี htmlSnapshot", (g.htmlSnapshots || []).length >= 1);

    // permission: marketing เข้าไม่ได้
    const mkt = await login("marketing", "marketing123");
    if (mkt)
      ok(
        "marketing → /api/case-evidence 403",
        (await jget(`/api/case-evidence?qc_score_id=${mc.qc_score_id}`, mkt))
          .status === 403,
      );
    else info("ข้าม marketing perm");
  }

  // ---- fallback: qc_score ที่ไม่มีภาพ → screenshots ว่าง ----
  const good = await fetch(`${BASE}/api/manual-case`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sys },
    body: JSON.stringify({
      customer_name: "EVID GOOD",
      admin_name: "PK EVID",
      customer_text: "สวัสดีครับ",
      admin_text: "สวัสดีค่ะ ยินดีให้บริการค่ะ มีอะไรให้ช่วยเหลือไหมคะ",
      response_seconds: 20,
    }),
  }).then((r) => r.json());
  if (good.qc_score_id) {
    const g2 = await jget(
      `/api/case-evidence?qc_score_id=${good.qc_score_id}`,
      sys,
    ).then((r) => r.json());
    ok(
      "เคสไม่มีภาพ → screenshots ว่าง (fallback)",
      Array.isArray(g2.screenshots) && g2.screenshots.length === 0,
    );
  }

  // no param → 400
  ok(
    "case-evidence ไม่มี param → 400",
    (await jget(`/api/case-evidence`, sys)).status === 400,
  );

  console.log(
    `\n===== Evidence: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} / ข้าม ${skip} =====`,
  );
  process.exit(fail ? 1 : 0);
})();

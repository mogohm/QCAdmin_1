// test-log-reply.js — ตรวจการสร้าง payload + dedup คู่ QC และ (ถ้ามี API) ยิง log-reply จริง
//   npm run test:scraper  (ส่วนที่ 3)
//   ตั้ง QC_API_URL + QC_API_KEY เพื่อทดสอบ insert จริง + runQc
const fs = require("fs");
const path = require("path");
const { parseChatHTML, pairMessages, buildLogReplyPayload, qcPairKey } = require("../lib/scraper-core");

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
};

const html = fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "line-chat-sample.html"), "utf8");
const msgs = parseChatHTML(html, { now: new Date(2026, 5, 17) });
const pairs = pairMessages(msgs);

console.log("===== 1) buildLogReplyPayload =====");
const ctx = { line_user_id: "Utest123", customer_name: "ลูกค้า A", assigned_admin: "PK - Mei" };
const payload = buildLogReplyPayload(pairs[0], ctx);
const required = [
  "line_user_id",
  "customer_text",
  "customer_created_at",
  "admin_name",
  "admin_text",
  "admin_created_at",
  "response_seconds",
  "source",
];
for (const k of required) ok(`payload มี field: ${k}`, payload[k] !== undefined);
ok('payload.source = "scraper"', payload.source === "scraper");
ok(
  "payload มี alias text/admin_ts/customer_ts (รองรับ route เดิม)",
  payload.text === payload.admin_text &&
    payload.admin_ts === payload.admin_created_at &&
    payload.customer_ts === payload.customer_created_at,
);
ok("payload.line_user_id ส่งต่อจาก ctx", payload.line_user_id === "Utest123");

console.log("\n===== 2) duplicate protection (qcPairKey) =====");
const seen = new Set();
let dup = 0;
for (const p of [...pairs, ...pairs]) {
  const key = qcPairKey({ line_user_id: "Utest123", ...p });
  if (seen.has(key)) dup++;
  else seen.add(key);
}
ok("คู่ซ้ำถูกตรวจจับ (2 unique, 2 ซ้ำ)", seen.size === 2 && dup === 2, `unique=${seen.size} dup=${dup}`);

console.log("\n===== 3) live log-reply (ถ้ามี QC_API_URL + QC_API_KEY) =====");
const API = (process.env.QC_API_URL || "").replace(/\/$/, "");
const KEY = process.env.QC_API_KEY || process.env.ADMIN_API_KEY;
(async () => {
  if (API && KEY) {
    try {
      const body = buildLogReplyPayload(pairs[0], {
        line_user_id: "Utest_logreply_" + Date.now(),
        customer_name: "QC LogReply Test",
        assigned_admin: "PK - Mei",
      });
      const res = await fetch(`${API}/api/admin/log-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": KEY },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      ok("POST /api/admin/log-reply ok", j.ok === true, j.error || JSON.stringify(j).slice(0, 80));
      ok("return มี qc_score_id หรือ duplicate", "qc_score_id" in j || j.duplicate, JSON.stringify(j).slice(0, 100));
      if ("final_score" in j)
        ok("return มี final_score เป็นตัวเลข", typeof j.final_score === "number" || j.final_score === null);
    } catch (e) {
      ok("live log-reply", false, e.message);
    }
  } else {
    console.log("⏭️  ข้าม live test — ไม่มี QC_API_URL + QC_API_KEY (ทดสอบ payload/dedup แบบ offline แล้ว)");
  }

  console.log(`\n===== Log reply: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
  process.exit(fail ? 1 : 0);
})();

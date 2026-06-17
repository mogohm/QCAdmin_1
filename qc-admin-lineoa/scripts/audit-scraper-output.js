// audit-scraper-output.js — สรุปคุณภาพผล scrape จาก .storage/debug/scrape-log.jsonl (full ~110 บรรทัด)
//   npm run audit:scraper        (รัน dry-run ก่อนเพื่อสร้าง scrape-log.jsonl)
//
// รายงาน + เกณฑ์ acceptance:
//   - created_at missing ≤ 5%
//   - direction unknown = 0
//   - admin reply without customer pair ≤ 10%
//   - duplicate rate ไม่ผิดปกติ (≤ 30%)
const fs = require("fs");
const path = require("path");

const C = { red: "\x1b[31m", grn: "\x1b[32m", yel: "\x1b[33m", dim: "\x1b[2m", rst: "\x1b[0m", b: "\x1b[1m" };
const LOG = path.join(__dirname, "..", ".storage", "debug", "scrape-log.jsonl");
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

if (!fs.existsSync(LOG)) {
  console.error(`${C.red}❌ ไม่พบ ${path.relative(process.cwd(), LOG)}${C.rst}`);
  console.error("   รัน dry-run ก่อน:  node scraper.js --date=YYYY-MM-DD --headed --dry-run");
  process.exit(1);
}

const entries = fs
  .readFileSync(LOG, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

if (!entries.length) {
  console.error(`${C.red}❌ scrape-log.jsonl ว่าง${C.rst}`);
  process.exit(1);
}

const sum = (k) => entries.reduce((a, e) => a + (Number(e[k]) || 0), 0);
const totalChats = entries.length;
const noMsg = entries.filter((e) => (e.message_count || 0) === 0).length;
const totalMsg = sum("message_count");
const totalCust = sum("customer_message_count");
const totalAdmin = sum("admin_message_count");
const totalPairs = sum("pairs");
const missingCreatedAt = sum("missing_created_at");
const missingDirection = sum("missing_direction");
const unknownType = sum("unknown_message_type");
const adminNoPair = sum("admin_without_customer_pair");
const dupCount = sum("duplicates");
const parseFail = sum("parse_fail");
const dateLabelFail = entries.filter((e) => e.date_label_parsed === false).length;

const createdAtMissingPct = pct(missingCreatedAt, totalMsg);
const adminNoPairPct = pct(adminNoPair, totalPairs);
const dupRatePct = pct(dupCount, totalMsg + dupCount);
const custAdminRatio = totalAdmin ? (totalCust / totalAdmin).toFixed(2) : "∞";

console.log(
  `\n${C.b}===== SCRAPER OUTPUT AUDIT =====${C.rst}  ${C.dim}(${entries.length} chats จาก scrape-log.jsonl)${C.rst}\n`,
);
const row = (label, val, detail = "", color = C.rst) =>
  console.log(`  ${color}${String(val).padStart(7)}${C.rst}  ${label.padEnd(34)} ${C.dim}${detail}${C.rst}`);

row("total chats scanned", totalChats);
row("chats with no messages", noMsg, noMsg ? `${pct(noMsg, totalChats)}%` : "", noMsg ? C.yel : C.grn);
row("total messages", totalMsg, `customer ${totalCust} / admin ${totalAdmin}`);
row("customer/admin ratio", custAdminRatio);
row(
  "messages missing created_at",
  missingCreatedAt,
  `${createdAtMissingPct}%`,
  createdAtMissingPct > 5 ? C.red : C.grn,
);
row("messages missing direction", missingDirection, "", missingDirection > 0 ? C.red : C.grn);
row(
  "admin reply without customer pair",
  adminNoPair,
  `${adminNoPairPct}% ของ ${totalPairs} pairs`,
  adminNoPairPct > 10 ? C.red : C.grn,
);
row("duplicate rate", dupCount, `${dupRatePct}%`, dupRatePct > 30 ? C.red : C.grn);
row("unknown message type", unknownType, "", unknownType > 0 ? C.yel : C.grn);
row("date label parse fail", dateLabelFail, "", dateLabelFail > 0 ? C.yel : C.grn);
row(
  "parse-fail bubbles (raw saved)",
  parseFail,
  parseFail ? "ดู .storage/debug/html/parse-fail-*.html" : "",
  parseFail ? C.yel : C.grn,
);

// ---- acceptance gates ----
const fails = [];
if (createdAtMissingPct > 5) fails.push(`created_at missing ${createdAtMissingPct}% (>5%)`);
if (missingDirection > 0) fails.push(`direction unknown = ${missingDirection} (>0)`);
if (adminNoPairPct > 10) fails.push(`admin reply without customer pair ${adminNoPairPct}% (>10%)`);
if (dupRatePct > 30) fails.push(`duplicate rate ${dupRatePct}% (ผิดปกติ >30%)`);

console.log("");
if (fails.length) {
  console.log(`${C.red}${C.b}❌ AUDIT FAIL${C.rst}`);
  for (const f of fails) console.log(`   ${C.red}• ${f}${C.rst}`);
  process.exit(1);
}
console.log(
  `${C.grn}${C.b}✅ AUDIT PASS — ผ่านเกณฑ์ทั้งหมด (created_at≤5%, direction ครบ, admin-pair≤10%, dup ปกติ)${C.rst}\n`,
);
process.exit(0);

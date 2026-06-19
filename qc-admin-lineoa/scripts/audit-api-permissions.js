// audit-api-permissions.js — สแกน app/api/**/route.js แล้วรายงานว่า route ไหนมี guard/permission
//   พิมพ์ตาราง: route | methods | guarded | permission keys | risk
//   exit 1 ถ้าเจอ critical route (เขียนข้อมูล/ sensitive) ที่ไม่มี guard
const fs = require("fs");
const path = require("path");

const API_DIR = path.join(__dirname, "..", "app", "api");

// route ที่เป็น public ตั้งใจ (ไม่ต้อง guard)
const PUBLIC = ["/api/auth/login", "/api/auth/register", "/api/auth/me", "/api/auth/logout"];
// route ที่ใช้ x-api-key (service) ผ่าน requireAdmin ได้ (ถือว่า authed)
const APIKEY_OK = ["/api/auth/setup"];
// route สำคัญที่ "ต้อง" มี guard/requirePermission (ถ้าไม่มี = CRITICAL)
const SENSITIVE = [
  "/api/dashboard",
  "/api/sop",
  "/api/sop/[id]",
  "/api/qc-disputes",
  "/api/qc-disputes/[id]",
  "/api/system-events",
  "/api/system-events/[id]",
  "/api/scraper/job",
  "/api/admin/reply",
  "/api/admin/log-reply",
  "/api/commission",
  "/api/system/users",
  "/api/system/users/[id]",
  "/api/system/roles",
  "/api/system/roles/[role_key]",
  "/api/system/registration-requests",
  "/api/system/registration-requests/[id]",
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name === "route.js") out.push(full);
  }
  return out;
}

function routePath(file) {
  const rel = path.relative(path.join(__dirname, ".."), file).replace(/\\/g, "/");
  return "/" + rel.replace(/^app\//, "").replace(/\/route\.js$/, "");
}

function analyze(src) {
  const methods = [...src.matchAll(/export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\s*\(/g)].map((m) => m[1]);
  const hasGuard = /\bguard\s*\(/.test(src) || /\brequirePermission\s*\(/.test(src) || /\brequireRole\s*\(/.test(src);
  const legacy =
    /\brequireAdmin\s*\(/.test(src) ||
    /\brequireView\s*\(/.test(src) ||
    /\brequireManager\s*\(/.test(src) ||
    /\breadSession\s*\(/.test(src);
  // webhook สาธารณะที่ยืนยันด้วย LINE signature (HMAC) = ปลอดภัยแบบ signature
  const signature = /x-line-signature/i.test(src) || /verifySignature\s*\(/.test(src);
  // ดึง permission key จาก guard(req, "x", "y") / requirePermission(req, "x")
  const keys = new Set();
  for (const m of src.matchAll(/(?:guard|requirePermission)\s*\(\s*req\s*,([^)]*)\)/g)) {
    for (const k of m[1].matchAll(/["'`]([a-z0-9_.]+)["'`]/g)) keys.add(k[1]);
  }
  return { methods, hasGuard, legacy, signature, keys: [...keys] };
}

const files = walk(API_DIR).sort();
let critical = 0;
const rows = [];
for (const file of files) {
  const route = routePath(file);
  const src = fs.readFileSync(file, "utf8");
  const { methods, hasGuard, legacy, signature, keys } = analyze(src);
  const hasWrite = methods.some((m) => m !== "GET");

  let risk = "ok";
  if (PUBLIC.includes(route)) risk = "public";
  else if (signature) risk = "signature";
  else if (hasGuard) risk = "ok";
  else if (APIKEY_OK.includes(route) && legacy) risk = "api-key";
  else if (SENSITIVE.includes(route)) risk = "CRITICAL";
  else if (legacy) risk = "legacy-auth";
  else if (hasWrite) risk = "CRITICAL";
  else risk = "warn-open-get";

  // sensitive ต้องมี guard เท่านั้น
  if (SENSITIVE.includes(route) && !hasGuard) risk = "CRITICAL";
  if (risk === "CRITICAL") critical++;

  rows.push({
    route,
    methods: methods.join(",") || "-",
    guarded: hasGuard ? "yes" : legacy ? "legacy" : "no",
    keys: keys.join(" ") || "-",
    risk,
  });
}

console.log("== API PERMISSION AUDIT ==\n");
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("ROUTE", 44) + pad("METHODS", 18) + pad("GUARD", 8) + pad("RISK", 14) + "PERMISSIONS");
console.log("-".repeat(120));
for (const r of rows.sort(
  (a, b) => (a.risk === "CRITICAL" ? -1 : 1) - (b.risk === "CRITICAL" ? -1 : 1) || a.route.localeCompare(b.route),
)) {
  const flag = r.risk === "CRITICAL" ? "❌" : ["ok", "public", "api-key", "signature"].includes(r.risk) ? "✅" : "⚠️ ";
  console.log(flag + " " + pad(r.route, 42) + pad(r.methods, 18) + pad(r.guarded, 8) + pad(r.risk, 14) + r.keys);
}

// ตรวจ sensitive ครบทุกตัว
const missing = SENSITIVE.filter((s) => !rows.find((r) => r.route === s));
console.log("\n" + "-".repeat(120));
console.log(`รวม ${rows.length} routes · sensitive ${SENSITIVE.length} · critical ${critical}`);
if (missing.length) console.log("⚠️  sensitive route ที่หาไฟล์ไม่เจอ: " + missing.join(", "));

if (critical > 0) {
  console.log(`\n===== API audit: ❌ FAIL — ${critical} critical route ไม่มี guard =====`);
  process.exit(1);
}
console.log("\n===== API audit: ✅ PASS — ทุก sensitive/write route มี guard =====");
process.exit(0);
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

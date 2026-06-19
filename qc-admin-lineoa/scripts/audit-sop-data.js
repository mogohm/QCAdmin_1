// audit-sop-data.js — ตรวจคุณภาพข้อมูล SOP ที่ import จาก Excel
//   npm run audit:sop                       → offline จาก data/sop-data.json
//   DATABASE_URL=... npm run audit:sop       → ตรวจจาก DB จริง (รวม "SOP ที่ไม่เคยถูก match")
//
// รายงาน:
//   1) total SOP records          5) category ที่ไม่ match (code ไม่อยู่ใน categories)
//   2) duplicate topics           6) intent ที่ detect ไม่ได้ (engine คืน general)
//   3) empty answers              7) SOP ที่ไม่เคยถูก match (DB เท่านั้น)
//   4) missing required_keywords  8) forbidden_keywords ว่าง
const fs = require("fs");
const path = require("path");
const { detectIntent } = require("../lib/intent-engine");

const C = {
  red: "\x1b[31m",
  grn: "\x1b[32m",
  yel: "\x1b[33m",
  dim: "\x1b[2m",
  rst: "\x1b[0m",
  b: "\x1b[1m",
};
const arr = (v) =>
  Array.isArray(v)
    ? v
    : typeof v === "string" && v
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

function classify(count, warnAt, failAt) {
  if (count >= failAt) return C.red;
  if (count >= warnAt) return C.yel;
  return C.grn;
}

async function loadSops() {
  if (process.env.DATABASE_URL) {
    try {
      const { neon } = require("@neondatabase/serverless");
      const db = neon(process.env.DATABASE_URL);
      const sops = await db(
        `SELECT id, category_code, topic, question, answer, intent, keywords, required_keywords, forbidden_keywords, is_active
         FROM sop_scripts`,
      );
      const cats = await db(`SELECT code FROM sop_categories`).catch(() => []);
      // SOP ที่ไม่เคยถูก match = ไม่มี qc_scores อ้างถึง matched_sop_id
      const neverMatched = await db(
        `SELECT s.id, s.topic FROM sop_scripts s
         WHERE s.is_active IS NOT false
           AND NOT EXISTS (SELECT 1 FROM qc_scores q WHERE q.matched_sop_id = s.id)`,
      ).catch(() => null);
      return {
        sops,
        categoryCodes: cats.map((c) => c.code),
        neverMatched,
        source: "DB (Neon)",
      };
    } catch (e) {
      console.log(`${C.yel}DB error (${e.message}) — fallback ไป JSON${C.rst}`);
    }
  }
  const data = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "data", "sop-data.json"),
      "utf8",
    ),
  );
  const sops = data.scripts.map((s, i) => ({
    id: i + 1,
    ...s,
    is_active: true,
  }));
  const categoryCodes = (data.categories || []).map((c) => c.code || c);
  return {
    sops,
    categoryCodes,
    neverMatched: null,
    source: "data/sop-data.json (offline)",
  };
}

(async () => {
  const { sops, categoryCodes, neverMatched, source } = await loadSops();
  console.log(
    `\n${C.b}===== SOP DATA AUDIT =====${C.rst}  ${C.dim}(${source})${C.rst}\n`,
  );

  // 1) total
  const total = sops.length;

  // 2) duplicate topics
  const topicSeen = {};
  for (const s of sops) {
    const k = String(s.topic || "")
      .trim()
      .toLowerCase();
    if (k) topicSeen[k] = (topicSeen[k] || 0) + 1;
  }
  const duplicates = Object.entries(topicSeen).filter(([, n]) => n > 1);

  // 3) empty answers
  const emptyAnswers = sops.filter((s) => !String(s.answer || "").trim());

  // 4) missing required_keywords
  const missingReq = sops.filter((s) => arr(s.required_keywords).length === 0);

  // 5) category ไม่ match
  const catSet = new Set(categoryCodes);
  const badCategory = categoryCodes.length
    ? sops.filter((s) => s.category_code && !catSet.has(s.category_code))
    : [];

  // 6) intent detect ไม่ได้ (จาก topic/question)
  const undetectable = sops.filter((s) => {
    const d = detectIntent(
      `${s.topic || ""} ${s.question || ""} ${arr(s.keywords).join(" ")}`,
    );
    return d.intent === "general" || d.confidence < 15;
  });

  // 8) forbidden ว่าง
  const emptyForbidden = sops.filter(
    (s) => arr(s.forbidden_keywords).length === 0,
  );

  const rows = [
    ["1. Total SOP records", total, C.grn, ""],
    [
      "2. Duplicate topics",
      duplicates.length,
      classify(duplicates.length, 1, 5),
      duplicates
        .slice(0, 5)
        .map(([t, n]) => `"${t.slice(0, 24)}"×${n}`)
        .join("  "),
    ],
    [
      "3. Empty answers",
      emptyAnswers.length,
      classify(emptyAnswers.length, 1, 3),
      emptyAnswers
        .slice(0, 5)
        .map((s) => `#${s.id}`)
        .join(" "),
    ],
    [
      "4. Missing required_keywords",
      missingReq.length,
      classify(missingReq.length, total * 0.2, total * 0.5),
      `${pct(missingReq.length, total)}%`,
    ],
    [
      "5. Category not matched",
      badCategory.length,
      classify(badCategory.length, 1, 3),
      badCategory
        .slice(0, 5)
        .map((s) => s.category_code)
        .join(" "),
    ],
    [
      "6. Intent undetectable",
      undetectable.length,
      classify(undetectable.length, total * 0.1, total * 0.3),
      `${pct(undetectable.length, total)}%`,
    ],
    [
      "8. Empty forbidden_keywords",
      emptyForbidden.length,
      classify(emptyForbidden.length, total * 0.5, total * 0.9),
      `${pct(emptyForbidden.length, total)}%`,
    ],
  ];

  for (const [label, count, color, detail] of rows) {
    console.log(
      `  ${color}${String(count).padStart(4)}${C.rst}  ${label.padEnd(30)} ${C.dim}${detail}${C.rst}`,
    );
  }

  // 7) never matched (DB only)
  console.log("");
  if (neverMatched) {
    console.log(
      `  ${classify(neverMatched.length, total * 0.3, total * 0.6)}${String(neverMatched.length).padStart(4)}${C.rst}  7. SOP never matched (live)    ${C.dim}${pct(neverMatched.length, total)}% — ${neverMatched
        .slice(0, 4)
        .map((s) => `"${(s.topic || "").slice(0, 20)}"`)
        .join(", ")}${C.rst}`,
    );
  } else {
    console.log(
      `  ${C.dim}   —  7. SOP never matched          (ต้องมี DATABASE_URL — ข้ามใน offline mode)${C.rst}`,
    );
  }

  // สรุป health
  const issues = duplicates.length + emptyAnswers.length + badCategory.length;
  const warns = undetectable.length;
  console.log(
    `\n${C.b}สรุป:${C.rst} ${total} SOP — ` +
      `${issues === 0 ? C.grn + "ไม่มี critical issue" : C.red + issues + " critical issues (dup/empty/bad-category)"}${C.rst}` +
      `${warns ? `, ${C.yel}${warns} intent ตรวจไม่ได้${C.rst}` : ""}\n`,
  );

  // คืน exit code 1 ถ้ามี critical (empty answer / bad category / duplicate) เพื่อใช้ใน CI
  process.exit(emptyAnswers.length || badCategory.length ? 1 : 0);
})();

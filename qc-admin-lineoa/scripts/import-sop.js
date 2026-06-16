// import-sop.js — นำเข้า SOP จาก Excel เป็น knowledge base
//   npm run import:sop
// 1) อ่าน Excel ทุก sheet  2) auto-detect คอลัมน์  3) classify intent/หมวด
// 4) gen keywords / required / forbidden / escalation  5) เขียน data/sop-data.json
// 6) ถ้ามี DATABASE_URL → รัน migration + insert เข้า Postgres โดยตรง
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { detectIntent, INTENT_KEYWORDS, INTENTS } = require("../lib/intent-engine");

const ROOT = path.join(__dirname, "..");
const EXCEL_CANDIDATES = [
  path.join(ROOT, "..", "Ai-QA_ Data and SOPs edit.xlsx"),
  path.join(ROOT, "..", "Ai-QA_Data_and_SOPs edit.xlsx"),
  path.join(ROOT, "..", "Ai-QA_Data_and_SOPs.xlsx"),
];

const CATEGORY_NAMES = {
  register: "สมัครสมาชิก",
  deposit: "ฝากเงิน",
  withdraw: "ถอนเงิน",
  kyc: "ยืนยันตัวตน/บัญชี",
  promotion: "โปรโมชั่น",
  bonus: "โบนัส",
  jackpot: "แจ็คพอต/Leaderboard",
  poker: "โป๊กเกอร์/วิธีเล่น",
  tournament: "ทัวร์นาเมนต์",
  technical_issue: "ปัญหาทางเทคนิค/ระบบ",
  escalation: "ส่งต่อทีมงาน",
  closing: "ปิดเคส/แจ้งรอ",
  general: "ทั่วไป",
};

// คำต้องห้ามระดับ global (ใช้เป็น forbidden ของทุก SOP + fatal rule)
const GLOBAL_FORBIDDEN = ["โง่", "บ้า", "เรื่องมาก", "รำคาญ", "หัดอ่าน", "ทำไมไม่อ่าน", "ไม่รู้", "ไม่ทราบ", "ช่างมัน"];
const TH_STOP = new Set([
  "และ",
  "หรือ",
  "ที่",
  "ให้",
  "ได้",
  "เป็น",
  "ของ",
  "กับ",
  "จะ",
  "การ",
  "ใน",
  "ค่ะ",
  "ครับ",
  "นะคะ",
  "นะครับ",
  "คุณ",
  "ลูกค้า",
  "แอดมิน",
  "รบกวน",
  "สำหรับ",
  "กรณี",
  "โดย",
  "แล้ว",
  "คือ",
  "มี",
  "จาก",
  "ไป",
  "มา",
  "ขอ",
  "ตาม",
]);

function extractTokens(text = "") {
  const out = new Set();
  // English / domain terms (มี & _ - ได้)
  for (const m of String(text).matchAll(/[a-zA-Z][a-zA-Z0-9&_]{2,}/g)) out.add(m[0].toLowerCase());
  // Thai chunks (ติดกัน ≥ 2 ตัว) ตัดด้วยช่องว่าง/วรรคตอน
  for (const m of String(text).matchAll(/[฀-๿]{2,}/g)) {
    const w = m[0];
    if (!TH_STOP.has(w) && w.length >= 3) out.add(w);
  }
  return [...out];
}

function genKeywords(topic) {
  // keyword สำหรับ match คำถามลูกค้า — มาจาก topic เป็นหลัก
  const toks = extractTokens(topic).filter((w) => !/^\d+$/.test(w));
  return [...new Set(toks)].slice(0, 8);
}

function genRequired(topic, answer) {
  // คำที่คำตอบที่ถูกควรมี — domain terms ในคำตอบ + token เด่นจาก topic ที่ปรากฏในคำตอบ + ลิงก์
  const a = String(answer);
  const req = new Set();
  // ลิงก์
  for (const m of a.matchAll(/https?:\/\/[^\s)]+/g)) req.add(m[0].replace(/[.,]$/, ""));
  // English domain terms ในคำตอบ
  const en = (a.match(/[a-zA-Z][a-zA-Z0-9&_]{2,}/g) || []).map((x) => x.toLowerCase());
  for (const w of en)
    if (!["the", "and", "you", "for", "your", "please", "wait", "com", "www", "https", "http"].includes(w)) req.add(w);
  // token จาก topic ที่อยู่ในคำตอบด้วย
  for (const t of extractTokens(topic)) if (a.includes(t)) req.add(t);
  return [...req].filter(Boolean).slice(0, 6);
}

function isEscalation(topic, answer) {
  const s = (topic + " " + answer).toLowerCase();
  return /live chat|livechat|ติดต่อทีม|ประสานงาน|ติดต่อ.*support|support.*team|ติดต่อซัพ/.test(s);
}

function readExcel() {
  const file = EXCEL_CANDIDATES.find((f) => fs.existsSync(f));
  if (!file) throw new Error("ไม่พบไฟล์ Excel SOP: " + EXCEL_CANDIDATES.join(" | "));
  const wb = XLSX.readFile(file);
  console.log(`📄 อ่าน: ${path.basename(file)} | sheets: ${wb.SheetNames.join(", ")}`);

  // auto-detect sheet ที่เป็น knowledge base: sheet ที่มีคอลัมน์ "แนวคำถาม"/"คำตอบ"/question/answer
  let kbSheet = null,
    qCol = null,
    aCol = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false });
    const header = (rows.find((r) => r.filter((c) => String(c).trim()).length >= 2) || []).map((c) => String(c).trim());
    const qi = header.findIndex((h) => /แนวคำถาม|คำถาม|question|topic|หัวข้อ/i.test(h));
    const ai = header.findIndex((h) => /คำตอบ|รายละเอียด|answer|script|response/i.test(h));
    if (qi >= 0 && ai >= 0) {
      kbSheet = name;
      qCol = header[qi];
      aCol = header[ai];
      break;
    }
  }
  if (!kbSheet) throw new Error("ตรวจไม่พบ sheet knowledge base (ต้องมีคอลัมน์คำถาม+คำตอบ)");
  console.log(`✅ knowledge base sheet = "${kbSheet}" (Q="${qCol}", A="${aCol}")`);

  const json = XLSX.utils.sheet_to_json(wb.Sheets[kbSheet], { defval: "", raw: false });
  const records = [];
  json.forEach((row, i) => {
    const topic = String(row[qCol] || "").trim();
    const answer = String(row[aCol] || "").trim();
    if (!topic || !answer) return; // ข้ามแถวว่าง/ไม่มีคำตอบ
    records.push({ topic, answer, source_sheet: kbSheet, source_row: i + 2 });
  });
  return records;
}

function build() {
  const raw = readExcel();
  const scripts = [];
  const catSet = new Set();
  const intentCount = {};

  for (const r of raw) {
    const det = detectIntent(r.topic + " " + r.answer);
    const intent = det.intent === "general" ? detectIntent(r.topic).intent : det.intent;
    const category_code = intent;
    catSet.add(category_code);
    intentCount[intent] = (intentCount[intent] || 0) + 1;

    scripts.push({
      category_code,
      topic: r.topic,
      question: r.topic,
      answer: r.answer,
      intent,
      keywords: genKeywords(r.topic),
      required_keywords: genRequired(r.topic, r.answer),
      forbidden_keywords: GLOBAL_FORBIDDEN,
      escalation: isEscalation(r.topic, r.answer),
      source_sheet: r.source_sheet,
      source_row: r.source_row,
    });
  }

  const categories = [...catSet].map((code) => ({
    code,
    name: CATEGORY_NAMES[code] || code,
    description: `หมวด SOP: ${CATEGORY_NAMES[code] || code}`,
  }));

  const intent_patterns = [];
  for (const intent of INTENTS)
    for (const [pattern, weight, lang] of INTENT_KEYWORDS[intent])
      intent_patterns.push({ intent, pattern: pattern.toLowerCase(), lang, weight });

  const fatal_rules = [
    {
      code: "FATAL-RUDE",
      name: "ใช้คำหยาบ/ดูถูกลูกค้า",
      description: "แอดมินใช้คำไม่สุภาพหรือดูถูกลูกค้า",
      patterns: ["โง่", "บ้า", "เรื่องมาก", "รำคาญ", "หัดอ่าน", "ทำไมไม่อ่าน", "ปัญญาอ่อน"],
      applies_to: null,
    },
    {
      code: "FATAL-BLAME",
      name: "โทษ/ตำหนิลูกค้า",
      description: "โยนความผิดให้ลูกค้า",
      patterns: ["เป็นความผิดของลูกค้า", "ลูกค้าผิดเอง", "ก็บอกแล้ว", "ไม่ใช่ความผิดเรา"],
      applies_to: null,
    },
    {
      code: "FATAL-GUARANTEE",
      name: "รับประกันผลการพนัน/เกินจริง",
      description: "การันตีว่าจะได้เงิน/ชนะแน่นอน (ผิดนโยบาย)",
      patterns: ["การันตีได้เงิน", "รับประกันได้เงิน", "ชนะแน่นอน", "ได้เงินแน่นอน100", "การันตีกำไร"],
      applies_to: null,
    },
    {
      code: "FATAL-DISMISS",
      name: "ปฏิเสธ/ไม่ช่วยเหลือ",
      description: "บอกปัดว่าไม่รู้/ไม่ช่วย โดยไม่ส่งต่อ",
      patterns: ["ไม่รู้", "ไม่ทราบเหมือนกัน", "ช่วยไม่ได้", "ไปถามที่อื่น", "ไม่ใช่หน้าที่"],
      applies_to: null,
    },
  ];

  return { categories, scripts, intent_patterns, fatal_rules, stats: { total: scripts.length, intents: intentCount } };
}

async function insertToDB(data) {
  const { neon } = require("@neondatabase/serverless");
  const db = neon(process.env.DATABASE_URL);

  // migration
  const mig = fs.readFileSync(path.join(ROOT, "sql", "migrate_v3_sop.sql"), "utf8");
  for (const part of mig
    .split(/;\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean))
    await db(part + ";").catch((e) => {
      if (!/already exists/i.test(e.message)) throw e;
    });
  console.log("🛠  migration v3 เสร็จ");

  for (const c of data.categories)
    await db`INSERT INTO sop_categories (code,name,description) VALUES (${c.code},${c.name},${c.description})
             ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description`;

  let n = 0;
  for (const s of data.scripts) {
    await db`INSERT INTO sop_scripts (category_code,topic,question,answer,intent,keywords,required_keywords,forbidden_keywords,escalation,source_sheet,source_row)
             VALUES (${s.category_code},${s.topic},${s.question},${s.answer},${s.intent},
                     ${JSON.stringify(s.keywords)},${JSON.stringify(s.required_keywords)},${JSON.stringify(s.forbidden_keywords)},
                     ${s.escalation},${s.source_sheet},${s.source_row})
             ON CONFLICT (topic) DO UPDATE SET answer=EXCLUDED.answer, intent=EXCLUDED.intent,
                     keywords=EXCLUDED.keywords, required_keywords=EXCLUDED.required_keywords,
                     forbidden_keywords=EXCLUDED.forbidden_keywords, escalation=EXCLUDED.escalation,
                     category_code=EXCLUDED.category_code`;
    n++;
  }
  for (const p of data.intent_patterns)
    await db`INSERT INTO intent_patterns (intent,pattern,lang,weight) VALUES (${p.intent},${p.pattern},${p.lang},${p.weight})
             ON CONFLICT (intent,pattern) DO UPDATE SET weight=EXCLUDED.weight, lang=EXCLUDED.lang`;
  for (const f of data.fatal_rules)
    await db`INSERT INTO fatal_rules (code,name,description,patterns,applies_to) VALUES (${f.code},${f.name},${f.description},${JSON.stringify(f.patterns)},${f.applies_to})
             ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, patterns=EXCLUDED.patterns`;

  console.log(
    `💾 insert: ${data.categories.length} categories, ${n} scripts, ${data.intent_patterns.length} patterns, ${data.fatal_rules.length} fatal rules`,
  );
}

(async () => {
  const data = build();
  // เขียน artifact (commit ได้ ใช้ import ผ่าน API บน Vercel)
  const outDir = path.join(ROOT, "data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "sop-data.json"), JSON.stringify(data, null, 2), "utf8");
  console.log(`\n📦 เขียน data/sop-data.json`);
  console.log("—— สถิติ ——");
  console.log(`รวม SOP: ${data.stats.total} records`);
  console.log(
    `หมวด (${data.categories.length}):`,
    data.categories.map((c) => `${c.code}=${data.stats.intents[c.code]}`).join(", "),
  );
  console.log(`intent patterns: ${data.intent_patterns.length} | fatal rules: ${data.fatal_rules.length}`);

  if (process.env.DATABASE_URL) {
    console.log("\n🔌 พบ DATABASE_URL — insert เข้า Postgres...");
    await insertToDB(data);
    console.log("✅ import เข้า DB สำเร็จ");
  } else {
    console.log(
      "\n⚠️  ไม่พบ DATABASE_URL — ข้าม insert DB (ใช้ data/sop-data.json + เรียก POST /api/admin/import-sop บน Vercel แทน)",
    );
  }
})().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});

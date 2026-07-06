// test-scraper-exact-date.js — ตรวจ "หลักการเก็บข้อมูลตามวันที่ที่เลือกเป๊ะ"
//   npm run test:scraper  (ส่วนสุดท้าย)
//   สถานการณ์อ้างอิง: วันนี้ = 2026-07-06, วันที่เลือก = 2026-07-05 (Asia/Bangkok)
//     - ห้อง A: active วันนี้ แต่มีประวัติ 07-05 → เป็น candidate, เก็บเฉพาะ 07-05
//     - ห้อง B: ล่าสุด 07-05 → เก็บ
//     - ห้อง C: ล่าสุด 07-04 → ไม่ผ่านช่วง (นอกเป้าหมาย)
//     - ลูกค้าอย่างเดียว (ไม่มีแอดมินตอบ) → ต้องถูกเก็บ + pending_reply
//     - แอดมินตอบ → เกิดคู่ QC
const D = require("../lib/scraper-date");
const core = require("../lib/scraper-core");

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
};

const TODAY = "2026-07-06";
const SEL = "2026-07-05";

// เวลาแบบ UTC ที่ตรงกับวัน Bangkok ที่ต้องการ (Bangkok = UTC+7)
//   07-05 กลางวันไทย = 07-05T05:00:00Z ; 07-05 ดึกไทย 21:31 = 07-05T14:31:00Z
//   *กับดัก timezone*: 07-05T21:31:00Z จริง ๆ คือ 07-06 04:31 เวลาไทย → ต้องถูกกันออก
const at = (d, hhmmBkk) => {
  // สร้าง ISO UTC จากวัน+เวลาไทย
  return `${d}T${hhmmBkk}:00+07:00`;
};

console.log("===== 1) validateScrapeRange: วันนี้/อนาคตต้องถูกบล็อก =====");
{
  // จำลอง "วันนี้จริง" ด้วยการเทียบกับ D.bangkokToday() — ทดสอบเชิงตรรกะด้วยค่าคงที่
  const y = D.bangkokYesterday();
  const t = D.bangkokToday();
  ok("เลือกเมื่อวาน → ok", D.validateScrapeRange(y, y).ok === true);
  ok(
    "เลือกวันนี้ → ถูกบล็อก",
    D.validateScrapeRange(t, t).ok === false,
    D.validateScrapeRange(t, t).error,
  );
  const tomorrow = new Date(Date.now() + 2 * 86400000)
    .toISOString()
    .slice(0, 10);
  ok("เลือกอนาคต → ถูกบล็อก", D.validateScrapeRange(tomorrow, tomorrow).ok === false);
  ok("from > to → ถูกบล็อก", D.validateScrapeRange(y, "2000-01-01").ok === false);
  ok("รูปแบบผิด (parse ไม่ได้) → ถูกบล็อก", D.validateScrapeRange("notadate").ok === false);
}

console.log("\n===== 2) messageInTargetRange: กัน 'วันนี้' รั่วเข้าเป้าหมาย =====");
{
  ok(
    "07-05 กลางวันไทย → อยู่ในเป้าหมาย 07-05",
    D.messageInTargetRange(at(SEL, "12:00"), SEL, SEL) === true,
  );
  ok(
    "07-05 ดึกไทย 23:31 → ยังเป็น 07-05 (อยู่ในเป้าหมาย)",
    D.messageInTargetRange(at(SEL, "23:31"), SEL, SEL) === true,
  );
  ok(
    "07-05T21:31Z (=07-06 04:31 ไทย) → ถูกกันออกจากเป้าหมาย 07-05",
    D.messageInTargetRange("2026-07-05T21:31:00Z", SEL, SEL) === false,
  );
  ok(
    "วันนี้ 07-06 → ไม่อยู่ในเป้าหมาย 07-05",
    D.messageInTargetRange(at(TODAY, "10:00"), SEL, SEL) === false,
  );
  ok(
    "07-04 → ไม่อยู่ในเป้าหมาย 07-05 (single day)",
    D.messageInTargetRange(at("2026-07-04", "10:00"), SEL, SEL) === false,
  );
  ok(
    "ช่วง 07-04..07-05: 07-04 → อยู่ในช่วง",
    D.messageInTargetRange(at("2026-07-04", "10:00"), "2026-07-04", SEL) === true,
  );
}

console.log("\n===== 3) candidate/ขอบล่าง: labelOnOrAfter =====");
{
  const NOW = new Date(2026, 6, 6, 12, 0, 0); // 6 ก.ค. 2026 เที่ยง (local test clock)
  // ห้อง A: label 'Today' (07-06) → ยังเป็น candidate เพราะ >= 07-05 (มีสิทธิ์มีประวัติ 07-05)
  ok("ห้อง A (Today) → candidate", core.labelOnOrAfter("Today", SEL, NOW) === true);
  // ห้อง B: label '5 ก.ค.' → candidate
  ok(
    "ห้อง B (07-05) → candidate",
    core.labelOnOrAfter("2026-07-05", SEL, NOW) === true,
  );
  // ห้อง C: label '4 ก.ค.' → ต่ำกว่า fromDate → หยุด scroll (ไม่ใช่ candidate)
  ok(
    "ห้อง C (07-04) → ไม่ใช่ candidate (ขอบล่าง)",
    core.labelOnOrAfter("2026-07-04", SEL, NOW) === false,
  );
}

console.log("\n===== 4) เก็บทุกข้อความก่อน + แยก QC pairing (customer-only ไม่หาย) =====");
{
  // ห้องลูกค้าอย่างเดียว: ข้อความลูกค้า 2 ข้อความ 07-05 ไม่มีแอดมินตอบ
  const custOnly = [
    { direction: "customer", message_text: "สอบถามหน่อยครับ", created_at: at(SEL, "10:00") },
    { direction: "customer", message_text: "ยังอยู่ไหมครับ", created_at: at(SEL, "10:05") },
  ];
  const pairsCO = core.pairMessages(custOnly, { groupWindowSec: 180 });
  const realPairsCO = pairsCO.filter((p) => p.customer_text && p.admin_text);
  ok("customer-only → ไม่มีคู่ QC (admin_text ว่าง)", realPairsCO.length === 0);
  // pending: ลูกค้าที่อยู่หลัง admin คนสุดท้าย (ไม่มี admin เลย → ทั้งหมด pending)
  let lastAdmin = -1;
  custOnly.forEach((m, i) => { if (m.direction === "admin") lastAdmin = i; });
  const pending = custOnly.filter((m, i) => m.direction === "customer" && i > lastAdmin);
  ok("customer-only → pending_reply = 2", pending.length === 2);

  // ห้องแอดมินตอบ: ลูกค้าถาม + แอดมิน (PK) ตอบ → เกิดคู่ QC
  const replied = [
    { direction: "customer", message_text: "ฝากเงินยังไงครับ", created_at: at(SEL, "11:00") },
    { direction: "admin", message_text: "ทำรายการผ่านเมนูฝากได้เลยครับ", created_at: at(SEL, "11:01"), admin_name: "PK - Jane" },
  ];
  const pairsR = core.pairMessages(replied, { groupWindowSec: 180 });
  const realPairsR = pairsR.filter((p) => p.customer_text && p.admin_text);
  ok("admin-replied → เกิดคู่ QC 1 คู่", realPairsR.length === 1);
  ok(
    "คู่ QC มี customer_text + admin_text ครบ",
    realPairsR[0]?.customer_text?.includes("ฝากเงิน") &&
      realPairsR[0]?.admin_text?.includes("เมนูฝาก"),
  );
}

console.log("\n===== 5) toDate ถูกใช้จริง (ช่วงหลายวัน) =====");
{
  const from = "2026-07-03";
  const to = "2026-07-05";
  ok("07-03 อยู่ในช่วง", D.messageInTargetRange(at("2026-07-03", "09:00"), from, to) === true);
  ok("07-05 อยู่ในช่วง", D.messageInTargetRange(at("2026-07-05", "09:00"), from, to) === true);
  ok("07-06 (วันนี้) นอกช่วง", D.messageInTargetRange(at("2026-07-06", "09:00"), from, to) === false);
  ok("07-02 ก่อนช่วง", D.messageInTargetRange(at("2026-07-02", "09:00"), from, to) === false);
}

console.log("\n===== 6) CRITICAL 1: Bangkok 01:00 → เมื่อวานถูกวัน (ไม่เพี้ยนเพราะ UTC) =====");
{
  // Bangkok 2026-07-07 01:00 (UTC = 2026-07-06 18:00)
  const epoch = Date.parse("2026-07-07T01:00:00+07:00");
  ok(
    "01:00 ไทย → today = 2026-07-07",
    D.bangkokDayAt(epoch, 0) === "2026-07-07",
    D.bangkokDayAt(epoch, 0),
  );
  ok(
    "01:00 ไทย → yesterday = 2026-07-06 (ไม่ใช่ 07-05)",
    D.bangkokDayAt(epoch, -1) === "2026-07-06",
    D.bangkokDayAt(epoch, -1),
  );
  // เทียบวิธี UTC เดิม (ต้องได้ค่าที่ "ผิด" เพื่อยืนยันว่าบั๊กเดิมมีจริง)
  const utcYesterday = new Date(epoch - 86400000).toISOString().slice(0, 10);
  ok(
    "วิธี UTC เดิมให้ค่าผิด (2026-07-05) — ยืนยันบั๊กเดิม",
    utcYesterday === "2026-07-05",
  );
}

console.log("\n===== 7) CRITICAL 2: external_chat_key คงที่ (rerun ได้ key เดิม) =====");
{
  const acct = "838160";
  // ไม่มี uid + ไม่มี chatId → hash(account + ชื่อ) ต้องคงที่ทุกครั้ง
  const k1 = core.buildExternalChatKey({ accountId: acct, name: "คุณสมชาย ใจดี" });
  const k2 = core.buildExternalChatKey({ accountId: acct, name: "คุณสมชาย ใจดี" });
  ok("no-uid → key ไม่ว่าง", !!k1 && k1.startsWith("scraper:"));
  ok("rerun เดิม → key เดิม (stable)", k1 === k2, k1);
  ok(
    "ชื่อ normalize (ช่องว่าง/ตัวพิมพ์) → key เดิม",
    k1 === core.buildExternalChatKey({ accountId: acct, name: "  คุณสมชาย   ใจดี  " }),
  );
  ok(
    "ชื่อต่างกัน → key ต่างกัน",
    k1 !== core.buildExternalChatKey({ accountId: acct, name: "คุณสมหญิง" }),
  );
  // มี chatId จาก URL → ใช้ chatId (คงที่กว่า hash) และคงที่ทุกครั้ง
  const c1 = core.buildExternalChatKey({ accountId: acct, chatId: "0958672075" });
  ok("มี chatId → ใช้ chat:<acct>:<id>", c1 === "chat:838160:0958672075");
  ok("rerun chatId → เดิม", c1 === core.buildExternalChatKey({ accountId: acct, chatId: "0958672075" }));
}

console.log("\n===== 8) MEDIUM 1: overlapping batch ไม่หยุดก่อนเวลา =====");
{
  // จำลอง scan: ใช้ resolveLabelDay หา oldest แล้วเทียบ boundary — ไม่ใช่ 'ไม่มี candidate ใหม่'
  const from = SEL; // 2026-07-05
  const NOW = new Date(2026, 6, 6, 12, 0, 0);
  const boundary = (labels) => {
    let oldest = null;
    for (const l of labels) {
      const d = core.resolveLabelDay(l, NOW);
      if (d && (oldest === null || d < oldest)) oldest = d;
    }
    return oldest !== null && oldest < from;
  };
  // batch ที่ virtual list ซ้อนกัน (ไม่มี item ใหม่) แต่ oldest ยัง >= from → ต้องไม่ถือว่าถึงขอบล่าง
  ok(
    "batch ซ้อน (oldest=07-05 = from) → ยังไม่ถึงขอบล่าง",
    boundary(["Today", "2026-07-06", "2026-07-05"]) === false,
  );
  ok(
    "oldest=07-06 (> from) → ยังไม่ถึงขอบล่าง",
    boundary(["Today", "2026-07-06"]) === false,
  );
  // เฉพาะเมื่อ oldest < from เท่านั้นจึงถึงขอบล่าง
  ok(
    "oldest=07-04 (< from) → ถึงขอบล่าง",
    boundary(["2026-07-05", "2026-07-04"]) === true,
  );
}

console.log("\n===== 9) STRICT policy: target/too_new/too_old classification =====");
{
  const from = "2026-07-04";
  const to = "2026-07-05";
  const NOW = new Date(2026, 6, 6, 12, 0, 0); // today 07-06
  ok("07-05 ในช่วง → target", core.classifyCandidate("2026-07-05", from, to, NOW) === "target");
  ok("07-04 ขอบล่างช่วง → target", core.classifyCandidate("2026-07-04", from, to, NOW) === "target");
  ok("Today (07-06 > to) → too_new", core.classifyCandidate("Today", from, to, NOW) === "too_new");
  ok("Yesterday (07-05 = to) → target", core.classifyCandidate("Yesterday", from, to, NOW) === "target");
  ok("07-03 (< from) → too_old", core.classifyCandidate("2026-07-03", from, to, NOW) === "too_old");
  ok("label มั่ว → unknown", core.classifyCandidate("???", from, to, NOW) === "unknown");
}

console.log("\n===== 11) STRICT vs DEEP: 25 ห้องวันนี้ (07-06), target 07-05 =====");
{
  // สถานการณ์จาก screenshot: today=07-06, target=07-05, ทุกห้อง label 'Today' (=07-06)
  const from = "2026-07-05", to = "2026-07-05";
  const NOW = new Date(2026, 6, 6, 12, 0, 0); // 07-06
  const chats = Array.from({ length: 25 }, (_, i) => ({ name: "c" + i, label: "Today" }));
  // จำลอง scanChatList: strict เปิดเฉพาะ target, deep เปิด too_new ด้วย
  const simulate = (strict) => {
    let target = 0, newerSkipped = 0, opened = 0;
    for (const it of chats) {
      const cls = core.classifyCandidate(it.label, from, to, NOW);
      if (cls === "target") { target++; opened++; }
      else if (cls === "too_new" || cls === "unknown") {
        if (strict) newerSkipped++;
        else { newerSkipped++; opened++; }
      }
    }
    return { opened, target, newerSkipped };
  };
  const s = simulate(true);
  ok("strict → opened = 0 (ไม่เปิดห้องวันนี้)", s.opened === 0, `opened=${s.opened}`);
  ok("strict → newerSkipped = 25", s.newerSkipped === 25);
  ok("strict → target_date_chats = 0", s.target === 0);
  const d = simulate(false);
  ok("deep_history → opened = 25", d.opened === 25, `opened=${d.opened}`);
}

console.log("\n===== 12) STRICT: Today ไม่ถูกเปิด / Yesterday(=target) เปิด / เก่ากว่า = ขอบล่าง =====");
{
  const target = "2026-07-05";
  const NOW = new Date(2026, 6, 6, 12, 0, 0); // today 07-06
  ok("Today → too_new (strict ไม่เปิด)", core.classifyCandidate("Today", target, target, NOW) === "too_new");
  ok("Yesterday (=target 07-05) → target (เปิด)", core.classifyCandidate("Yesterday", target, target, NOW) === "target");
  ok("07-04 (< target) → too_old (ขอบล่าง)", core.classifyCandidate("2026-07-04", target, target, NOW) === "too_old");
  // weekday: today 07-06 = จันทร์? resolveLabelDay ต้องได้วันที่จริง แล้ว classify
  ok("weekday label resolve ได้ (ไม่ crash)", typeof core.resolveLabelDay("Sunday", NOW) === "string");
}

console.log("\n===== 13) date-separator parse: 'Thu, Jun 4' / chatsys-date =====");
{
  // dayLabelToDate ต้องอ่าน 'Thu, Jun 4' เป็น 4 มิ.ย. (ไม่ใช่ 'วันพฤหัสล่าสุด')
  const NOW = new Date(2026, 6, 6, 12, 0, 0);
  const d = core.dayLabelToDate("Thu, Jun 4", NOW);
  ok("'Thu, Jun 4' → เดือน 6 (มิ.ย.)", d && d.getMonth() === 5, d && `${d.getMonth() + 1}/${d.getDate()}`);
  ok("'Thu, Jun 4' → วันที่ 4", d && d.getDate() === 4);
  const d2 = core.dayLabelToDate("Wed, Jul 1", NOW);
  ok("'Wed, Jul 1' → 1 ก.ค.", d2 && d2.getMonth() === 6 && d2.getDate() === 1);
  // standalone weekday ยังทำงาน (ไม่พังจากการ strip)
  ok("standalone 'Thursday' ยัง resolve เป็นวัน", core.dayLabelToDate("Thursday", NOW) instanceof Date);
  // parseChatHTML: date separator class จริง 'chatsys chatsys-date' → currentDate ถูกใช้ (ไม่ default now)
  const html = `
    <div class="chatsys chatsys-date dropdown">Wed, Jul 1<div class="v-portal"></div></div>
    <div class="chat chat-secondary"><div class="chat-item-text">สวัสดีครับ</div><span>10:30</span></div>`;
  const msgs = core.parseChatHTML(html, { now: NOW });
  const day = msgs[0] && new Date(msgs[0].created_at);
  ok("ข้อความใต้ 'Wed, Jul 1' → created_at = 1 ก.ค. (ไม่ใช่วันนี้)", day && day.getMonth() === 6 && day.getDate() === 1, day && day.toISOString().slice(0, 10));
}

console.log("\n===== 10) MEDIUM 3: 5 ข้อความลูกค้าไม่มีแอดมิน = 1 เคส =====");
{
  // จำลอง logic ใน chat-batch: นับ "บล็อกลูกค้าติดกัน" หลัง admin คนสุดท้าย
  const countCases = (msgs) => {
    let lastAdmin = -1;
    msgs.forEach((m, i) => { if (m.direction === "admin") lastAdmin = i; });
    const tail = msgs.slice(lastAdmin + 1);
    let cases = 0, prevCust = false, cnt = 0;
    for (const m of tail) {
      if (m.direction === "customer") { if (!prevCust) cases++; prevCust = true; cnt++; }
      else prevCust = false;
    }
    return { cases, messages: cnt };
  };
  const five = Array.from({ length: 5 }, (_, i) => ({ direction: "customer", text: "m" + i }));
  const r1 = countCases(five);
  ok("5 ข้อความลูกค้ารวด → 1 เคส", r1.cases === 1, `cases=${r1.cases}`);
  ok("5 ข้อความลูกค้ารวด → 5 ข้อความรอตอบ", r1.messages === 5);
  // system คั่นกลาง → 2 เคส
  const split = [
    { direction: "customer", text: "a" },
    { direction: "system", text: "sys" },
    { direction: "customer", text: "b" },
    { direction: "customer", text: "c" },
  ];
  const r2 = countCases(split);
  ok("system คั่น → 2 เคส", r2.cases === 2, `cases=${r2.cases}`);
  // มี admin ตอบท้าย → 0 เคส (ไม่มีลูกค้ารอ)
  const answered = [
    { direction: "customer", text: "q" },
    { direction: "admin", text: "a" },
  ];
  ok("แอดมินตอบท้าย → 0 เคส", countCases(answered).cases === 0);
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ผ่าน ${pass} / ล้มเหลว ${fail}`);
process.exit(fail === 0 ? 0 : 1);

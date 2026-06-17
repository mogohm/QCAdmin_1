// test-scraper-parser.js — ตรวจการแยก bubble customer/admin + pairing จาก HTML fixture (full ~96 บรรทัด)
//   npm run test:scraper  (ส่วนที่ 2)
const fs = require("fs");
const path = require("path");
const { parseChatHTML, pairMessages, dedupMessages } = require("../lib/scraper-core");

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
};

const html = fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "line-chat-sample.html"), "utf8");
const NOW = new Date(2026, 5, 17, 12, 0, 0);
const msgs = parseChatHTML(html, { now: NOW });

console.log("===== 1) แยก bubble =====");
ok("ได้ข้อความ 6 อัน (ไม่นับ system)", msgs.length === 6, `got ${msgs.length}`);
const cust = msgs.filter((m) => m.direction === "customer");
const adm = msgs.filter((m) => m.direction === "admin");
ok("customer 3 ข้อความ (bubble ซ้าย)", cust.length === 3, `got ${cust.length}`);
ok("admin 3 ข้อความ (bubble ขวา)", adm.length === 3, `got ${adm.length}`);
ok("ไม่มี system message หลุดเข้ามา", !msgs.some((m) => /เข้าร่วมการสนทนา/.test(m.message_text)));
ok(
  "admin มีชื่อจาก img[alt] = PK - Mei",
  adm.every((m) => m.admin_name === "PK - Mei"),
);
ok(
  "ดึงเวลาได้ (HH:MM)",
  msgs.every((m) => /^\d{1,2}:\d{2}/.test(m.time || "")),
  msgs.map((m) => m.time).join(","),
);
ok(
  "created_at เป็น ISO timestamp",
  msgs.every((m) => m.created_at && !isNaN(new Date(m.created_at))),
);

console.log("\n===== 2) message type =====");
const sticker = adm.find((m) => m.message_type === "sticker");
ok("ตรวจ sticker จาก data-mtype", !!sticker, sticker ? sticker.message_text : "ไม่เจอ");
ok("ข้อความ text ปกติ = type text", adm.filter((m) => m.message_type === "text").length === 2);

console.log("\n===== 2b) date separator + image/file/sticker types =====");
// inline HTML: date separator "Monday" + image (data-mtype) + file (download link) + sticker (img src)
const typeHtml = `
<div class="chatsys-date">Monday</div>
<div class="chat"><div class="chat-item-text">ส่งรูปให้ดูหน่อย</div><span>09:00</span></div>
<div class="chat chat-reverse"><img alt="PK - Mei"><div class="chat-item-text" data-mtype="image">[image]</div><span>09:01</span></div>
<div class="chat chat-reverse"><img alt="PK - Mei"><div class="chat-item-text"><a download href="/f.pdf">[file]</a></div><span>09:02</span></div>
<div class="chat chat-reverse"><img alt="PK - Mei" src="/sticker/x.png"><div class="chat-item-text">[sticker]</div><span>09:03</span></div>
<div class="chatsys chatsys-system">ระบบ: จบการสนทนา</div>`;
const tmsgs = parseChatHTML(typeHtml, { now: NOW });
ok("date separator ไม่ถูกนับเป็นข้อความ + system ถูกข้าม → 4 ข้อความ", tmsgs.length === 4, `got ${tmsgs.length}`);
ok(
  "date separator 'Monday' กำหนด created_at เป็นวันจันทร์",
  tmsgs.every((m) => m.created_at && new Date(m.created_at).getDay() === 1),
  tmsgs.map((m) => m.created_at).join(","),
);
ok(
  "ตรวจ type image",
  tmsgs.some((m) => m.message_type === "image"),
);
ok(
  "ตรวจ type file (จาก download link)",
  tmsgs.some((m) => m.message_type === "file"),
);
ok(
  "ตรวจ type sticker (จาก img src)",
  tmsgs.some((m) => m.message_type === "sticker"),
);
ok(
  "ทั้งหมดเป็น bubble admin (chat-reverse) ยกเว้นข้อความลูกค้าแรก",
  tmsgs.filter((m) => m.direction === "admin").length === 3,
);

console.log("\n===== 3) pairing (รวมหลายข้อความ + รวม bubble admin ≤90s) =====");
const pairs = pairMessages(msgs, { groupWindowSec: 90 });
ok("ได้ 2 คู่ QC", pairs.length === 2, `got ${pairs.length}`);
const p1 = pairs[0];
ok("คู่ 1: รวมคำถามลูกค้า 2 ข้อความ", /ขอลิงก์ฝากเงิน/.test(p1.customer_text) && /วิธีไหน/.test(p1.customer_text));
ok("คู่ 1: รวม bubble admin 2 อันเป็นคำตอบเดียว", /เมนูฝาก/.test(p1.admin_text) && /ตรวจสอบยอด/.test(p1.admin_text));
ok("คู่ 1: admin_name = PK - Mei", p1.admin_name === "PK - Mei");
ok("คู่ 1: response_seconds = 60 (10:31→10:32)", p1.response_seconds === 60, String(p1.response_seconds));
ok("คู่ 1: reply_group_id มีค่า", !!p1.reply_group_id);
const p2 = pairs[1];
ok("คู่ 2: customer = ขอบคุณ, admin = sticker", /ขอบคุณ/.test(p2.customer_text) && p2.message_type === "sticker");

console.log("\n===== 4) duplicate protection =====");
const doubled = [...msgs, ...msgs.map((m) => ({ ...m }))]; // ป้อนซ้ำ
const { unique, skipped_duplicate } = dedupMessages(doubled, "Utest");
ok("ป้อน 12 (ซ้ำ) → unique 6", unique.length === 6, `unique=${unique.length}`);
ok("นับ skipped_duplicate = 6", skipped_duplicate === 6, `skipped=${skipped_duplicate}`);

console.log(`\n===== Parser: ${fail ? "❌ FAIL" : "✅ PASS"} — ผ่าน ${pass} / ล้มเหลว ${fail} =====`);
process.exit(fail ? 1 : 0);

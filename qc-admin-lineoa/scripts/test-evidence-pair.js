// test-evidence-pair.js — หลักฐานต้องชี้คู่ข้อความที่ให้คะแนนเป๊ะ
//   ตรวจ: source_message_key deterministic, pairMessages เก็บ bubble ต้นทางครบ,
//   การแยกข้อความซ้ำด้วยเวลา/ลำดับ (logic เดียวกับ locateMessageBubble)
const core = require("../lib/scraper-core");

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); };

console.log("===== 1) source_message_key: deterministic + แยกตามสัญญาณ =====");
{
  const base = { chatKey: "U123", direction: "customer", created_at: "2026-07-05T10:00:00Z", text: "ถอนเงินยังไงครับ", message_type: "text" };
  const k1 = core.sourceMessageKey(base);
  ok("รันซ้ำ → key เดิม", k1 === core.sourceMessageKey({ ...base }));
  ok("key ยาว 32 hex", /^[0-9a-f]{32}$/.test(k1));
  ok("เวลาเปลี่ยน → key เปลี่ยน", k1 !== core.sourceMessageKey({ ...base, created_at: "2026-07-05T10:05:00Z" }));
  ok("direction เปลี่ยน → key เปลี่ยน", k1 !== core.sourceMessageKey({ ...base, direction: "admin" }));
  ok("ข้อความเปลี่ยน → key เปลี่ยน", k1 !== core.sourceMessageKey({ ...base, text: "ฝากเงินยังไงครับ" }));
  ok("chat เปลี่ยน → key เปลี่ยน", k1 !== core.sourceMessageKey({ ...base, chatKey: "U999" }));
  ok("ช่องว่างต่างกัน (normalize) → key เดิม", k1 === core.sourceMessageKey({ ...base, text: "  ถอนเงินยังไงครับ  " }));
}

console.log("\n===== 2) pairMessages: เก็บ bubble ต้นทางครบทุกใบ =====");
{
  const at = (m) => `2026-07-05T10:${String(m).padStart(2, "0")}:00Z`;
  // ลูกค้า 4 ข้อความ → แอดมิน 3 bubble ติดกัน
  const msgs = [
    { direction: "customer", message_text: "สวัสดีครับ", created_at: at(0) },
    { direction: "customer", message_text: "ถอนเงินไม่ได้", created_at: at(1) },
    { direction: "customer", message_text: "ลองหลายรอบแล้ว", created_at: at(2) },
    { direction: "customer", message_text: "ช่วยหน่อยครับ", created_at: at(3) },
    { direction: "admin", message_text: "รับทราบครับ", created_at: at(4), admin_name: "PK - A" },
    { direction: "admin", message_text: "กำลังตรวจสอบให้", created_at: at(5), admin_name: "PK - A" },
    { direction: "admin", message_text: "แก้ให้แล้วครับ ลองอีกครั้ง", created_at: at(6), admin_name: "PK - A" },
  ];
  const pairs = core.pairMessages(msgs, { groupWindowSec: 180 });
  const p = pairs.find((x) => x.customer_text && x.admin_text);
  ok("ได้ 1 คู่", !!p && pairs.filter((x) => x.customer_text && x.admin_text).length === 1);
  ok("customer_items ครบ 4 ใบ", p?.customer_items?.length === 4, `got ${p?.customer_items?.length}`);
  ok("admin_items ครบ 3 bubble", p?.admin_items?.length === 3, `got ${p?.admin_items?.length}`);
  ok("item แรกของลูกค้า = ข้อความแรก", p?.customer_items?.[0]?.message_text === "สวัสดีครับ");
  ok("item แรกของแอดมิน = bubble แรก", p?.admin_items?.[0]?.message_text === "รับทราบครับ");
}

console.log("\n===== 3) แยกข้อความซ้ำ: text เดียวกัน 5 ครั้ง ต้องเลือกใบที่เวลา/ลำดับตรง =====");
{
  // จำลอง candidate matching แบบเดียวกับ locateMessageBubble (direction+text → time → dom order)
  const bubbles = Array.from({ length: 5 }, (_, i) => ({
    i, dir: "customer", text: "โอเคครับ", time: `10:0${i}`,
  }));
  const match = (meta) => {
    let cands = bubbles.filter((x) => x.dir === meta.direction && x.text === meta.text);
    const candidateCount = cands.length;
    if (cands.length > 1 && meta.time) {
      const t = cands.filter((x) => x.time === meta.time);
      if (t.length) cands = t;
    }
    if (cands.length > 1 && Number.isInteger(meta.occurrence))
      cands = [cands[Math.min(meta.occurrence, cands.length - 1)]];
    return { chosen: cands[0], candidateCount, unique: cands.length === 1 };
  };
  const r = match({ direction: "customer", text: "โอเคครับ", time: "10:03" });
  ok("เจอ candidate 5 ใบ (text ซ้ำ)", r.candidateCount === 5);
  ok("เวลาแยกได้ → เลือกใบ 10:03", r.unique && r.chosen?.time === "10:03");
  const r2 = match({ direction: "customer", text: "โอเคครับ", time: null, occurrence: 2 });
  ok("ไม่มีเวลา → ใช้ลำดับ DOM (occurrence=2)", r2.unique && r2.chosen?.i === 2);
  const r3 = match({ direction: "admin", text: "โอเคครับ" });
  ok("direction ไม่ตรง → ไม่เจอ (ห้าม match ด้วย text อย่างเดียว)", !r3.chosen);
}

console.log("\n===== 4) locator metadata จาก parseChatHTML =====");
{
  const html = `
    <div class="chatsys chatsys-date dropdown">Wed, Jul 1</div>
    <div class="chat chat-secondary"><div class="chat-item-text">สวัสดีครับ</div><span>10:30</span></div>
    <div class="chat chat-reverse chat-secondary"><div class="chat-item-text">สวัสดีค่ะ</div><span>10:31</span></div>`;
  const msgs = core.parseChatHTML(html, { now: new Date(2026, 6, 6) });
  ok("มี dom_index", msgs.every((m) => Number.isInteger(m.dom_index)));
  ok("dom_index เรียงตามเอกสาร", msgs[0].dom_index < msgs[1].dom_index);
  ok("มี timestamp_text", msgs[0].timestamp_text === "10:30");
  ok("มี date_separator (วันจริง)", msgs[0].date_separator === "2026-06-30" || msgs[0].date_separator === "2026-07-01", msgs[0].date_separator);
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ผ่าน ${pass} / ล้มเหลว ${fail}`);
process.exit(fail === 0 ? 0 : 1);

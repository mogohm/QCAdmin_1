// test-scraper-status.js — สถานะ scraper บน UI ต้องถูกต้อง (progress ห้ามเกิน 100%)
const { normalizeJobStatus, stepLabel } = require("../lib/scraper-status");

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); };

console.log("===== 1) target=49 processed=12 messages=180 → 24% =====");
{
  const s = normalizeJobStatus({ status: "running", counters: { target_date_chats: 49, processed_chats: 12, messages_inserted: 180 } });
  ok("pct = 24 (จากห้อง ไม่ใช่ข้อความ)", s.pct === 24, `pct=${s.pct}`);
  ok("roomsLabel = '12 / 49 ห้อง (24%)'", s.roomsLabel === "12 / 49 ห้อง (24%)");
  ok("remaining = 37", s.remaining === 37);
  ok("messages = 180 (ไม่ปนกับ %)", s.messages === 180);
}

console.log("\n===== 2) processed > target → clamp 100% =====");
{
  const s = normalizeJobStatus({ status: "running", counters: { target_date_chats: 10, processed_chats: 25 } });
  ok("pct = 100 (clamped)", s.pct === 100, `pct=${s.pct}`);
  ok("remaining = 0 (ไม่ติดลบ)", s.remaining === 0);
}

console.log("\n===== 3) ไม่มี counters ใหม่ → fallback total_chats/logged_count =====");
{
  const s = normalizeJobStatus({ status: "running", total_chats: 50, logged_count: 200 });
  ok("target fallback = 50", s.target === 50);
  ok("messages fallback = 200", s.messages === 200);
  ok("pct = 0 (ยังไม่มี processed — ไม่ใช่ 400%)", s.pct === 0, `pct=${s.pct}`);
}

console.log("\n===== 4) ไม่มี job → null (ไม่มี cards/chip) =====");
{
  ok("null job → null", normalizeJobStatus(null) === null);
  ok("undefined → null", normalizeJobStatus(undefined) === null);
}

console.log("\n===== 5) ทุก field ไม่มีค่า → 0 ไม่ใช่ undefined/NaN =====");
{
  const s = normalizeJobStatus({ status: "pending" });
  for (const k of ["target", "processed", "remaining", "messages", "skipped", "failed", "pct"])
    ok(`${k} = 0`, s[k] === 0, `${k}=${s[k]}`);
}

console.log("\n===== 6) บั๊กเดิม: logged_count/total_chats ต้องไม่ถูกใช้เป็น % =====");
{
  // สถานการณ์จริงที่เคยโชว์ 245%: total=49 logged=120
  const s = normalizeJobStatus({ status: "running", total_chats: 49, logged_count: 120, counters: { processed_chats: 12, target_date_chats: 49 } });
  ok("pct = 24 ไม่ใช่ 245", s.pct === 24, `pct=${s.pct}`);
  ok("pct <= 100 เสมอ", s.pct >= 0 && s.pct <= 100);
}

console.log("\n===== 7) stepLabel ไทย =====");
ok("scanning → กำลังสแกนรายการแชท", stepLabel("scanning") === "กำลังสแกนรายการแชท");
ok("ไม่มี step → —", stepLabel(null) === "—");

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ผ่าน ${pass} / ล้มเหลว ${fail}`);
process.exit(fail === 0 ? 0 : 1);

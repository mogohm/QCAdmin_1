// test-db-id.js — regression: กันบั๊ก "invalid input syntax for type uuid: 23"
//   ตรวจ isUuid / parseNumericId / validateEntityId ให้แยกชนิด id ถูกต้อง
const { isUuid, parseNumericId, validateEntityId } = require("../lib/db-id");

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
};

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

console.log("===== isUuid =====");
ok("UUID จริง → true", isUuid(UUID) === true);
ok('"23" → false', isUuid("23") === false);
ok("ตัวเลข 23 → false", isUuid(23) === false);
ok("สตริงมั่ว → false", isUuid("not-a-uuid") === false);
ok("null → false", isUuid(null) === false);
ok("UUID มีช่องว่างหน้า/หลัง → true (trim)", isUuid(`  ${UUID}  `) === true);

console.log("\n===== parseNumericId =====");
ok('"23" → 23', parseNumericId("23") === 23);
ok("23 → 23", parseNumericId(23) === 23);
ok('"23abc" → null', parseNumericId("23abc") === null);
ok('"1.5" → null', parseNumericId("1.5") === null);
ok("UUID → null", parseNumericId(UUID) === null);
ok('"" → null', parseNumericId("") === null);
ok("null → null", parseNumericId(null) === null);

console.log("\n===== validateEntityId(value, 'uuid') =====");
ok("UUID → ok", validateEntityId(UUID, "uuid").ok === true);
{
  const r = validateEntityId("23", "uuid");
  ok('"23" → ไม่ ok (กันบั๊กเดิม)', r.ok === false, r.error);
}
ok("null → ไม่ ok", validateEntityId(null, "uuid").ok === false);

console.log("\n===== validateEntityId(value, 'int') =====");
ok('"23" → ok value=23', (() => { const r = validateEntityId("23", "int"); return r.ok && r.value === 23; })());
ok("UUID → ไม่ ok (int)", validateEntityId(UUID, "int").ok === false);
ok('"abc" → ไม่ ok', validateEntityId("abc", "int").ok === false);

// error ต้องเป็นข้อความไทย ไม่ใช่ raw
{
  const r = validateEntityId("23", "uuid");
  ok("error เป็นข้อความไทย (ไม่ leak ชนิด SQL)", /[ก-๙]/.test(r.error) && !/uuid.*23/i.test(r.error), r.error);
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ผ่าน ${pass} / ล้มเหลว ${fail}`);
process.exit(fail === 0 ? 0 : 1);

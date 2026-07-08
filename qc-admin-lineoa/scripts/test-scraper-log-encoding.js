// test-scraper-log-encoding.js — ภาษาไทยใน console/logfile ต้องเป็น UTF-8 ไม่เพี้ยน
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${n}${x ? " — " + x : ""}`); };

console.log("===== 1) เขียน/อ่านไฟล์ log ภาษาไทยแบบ UTF-8 ต้องตรงเป๊ะ =====");
{
  const dir = path.join(__dirname, "../.storage/logs");
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, "encoding-test.log");
  const samples = [
    "[WAIT] รอรับ Job จากหน้าเว็บ /scraper ...",
    "[JOB] รับงานใหม่ · ช่วงวันที่เลือก 2026-07-07 (Asia/Bangkok)",
    "[SCAN] กำลังสแกนรายการแชท round=1 visible=25",
    "[DONE] ✅ เสร็จสิ้น · เก็บได้ 12 ห้อง 🟢",
  ];
  fs.writeFileSync(f, samples.join("\n"), "utf8");
  const read = fs.readFileSync(f, "utf8").split("\n");
  samples.forEach((s, i) => ok(`บรรทัด ${i + 1} ตรงเป๊ะ (${s.slice(0, 14)}…)`, read[i] === s));
  const bytes = fs.readFileSync(f);
  ok("ไม่มี BOM", !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  ok("ไม่ใช่ UTF-16 (ไม่มี null bytes)", !bytes.includes(0));
  fs.unlinkSync(f);
}

console.log("\n===== 2) scraper-live.bat = chcp 65001 + node runner (ไม่มี PowerShell pipeline) =====");
{
  // สัญญาใหม่ (P0-8): bat บาง ๆ เรียก scripts/run-scraper-live.js — node เป็นคน pipe
  // console + เขียน log UTF-8 เอง จึงไม่มี NativeCommandError wrapper จาก WP5.1 อีก
  const batRaw = fs.readFileSync(path.join(__dirname, "../scraper-live.bat"), "utf8");
  const bat = batRaw.split(/\r?\n/).filter((l) => !/^\s*REM/i.test(l)).join("\n");
  ok("chcp 65001 ก่อน node", bat.includes("chcp 65001"));
  ok("เรียก node runner", /node scripts\\run-scraper-live\.js %\*/.test(bat));
  ok("ไม่มี PowerShell pipeline (powershell/pwsh/Tee/ForEach)", !/powershell|pwsh|Tee-Object|ForEach-Object/i.test(bat));
  const runner = fs.readFileSync(path.join(__dirname, "../scripts/run-scraper-live.js"), "utf8");
  ok("runner เขียน log UTF-8", runner.includes('encoding: "utf8"'));
  ok("runner pipe stdout+stderr ตรงถึง console", runner.includes("child.stdout.on") && runner.includes("child.stderr.on"));
  ok("runner เก็บ exit code จริงของ scraper", runner.includes("code ?? 1"));
  const bytes = fs.readFileSync(path.join(__dirname, "../scraper-live.bat"));
  ok("bat เป็น UTF-8 ไม่มี BOM", !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  ok("bat เป็น CRLF", bytes.includes(0x0d));
}

console.log("\n===== 3) scraper.js มี encoding self-test + คำเตือน code page =====");
{
  const s = fs.readFileSync(path.join(__dirname, "../scraper.js"), "utf8");
  ok("มี [ENCODING] self-test ภาษาไทย", s.includes("ทดสอบการแสดงผลภาษาไทย"));
  ok("ตรวจ chcp ≠ 65001 → WARNING ภาษาอังกฤษ", s.includes("Console UTF-8 encoding is not configured correctly"));
}

console.log("\n===== 4) UI: สถานะสแกน 0/0 → 'กำลังค้นหา' ไม่ใช่เหมือนไม่มีงาน =====");
{
  const { isScanningNoTarget, stepLabel } = require("../lib/scraper-status");
  ok("scanning+0/0 → true", isScanningNoTarget({ currentStep: "scanning", target: 0, processed: 0 }) === true);
  ok("scan เสร็จ (target>0) → false", isScanningNoTarget({ currentStep: "opening", target: 49, processed: 0 }) === false);
  const page = fs.readFileSync(path.join(__dirname, "../app/scraper/page.js"), "utf8");
  ok("UI มี 'กำลังค้นหา'", page.includes("กำลังค้นหา"));
  ok("UI มี 'รอผลสแกน'", page.includes("รอผลสแกน"));
  ok("UI มีข้อความสแกนแทน 0/0", page.includes("กำลังสแกนรายการแชทเพื่อค้นหาห้องของวันที่เลือก"));
  // sub-status labels ตาม spec
  ok("scanning → กำลังสแกนรายการแชท", stepLabel("scanning") === "กำลังสแกนรายการแชท");
  ok("saving → กำลังบันทึกข้อมูล", stepLabel("saving") === "กำลังบันทึกข้อมูล");
  ok("waiting → รอรับงาน", stepLabel("waiting") === "รอรับงาน");
  ok("evidence → กำลังเก็บหลักฐาน", stepLabel("evidence") === "กำลังเก็บหลักฐาน");
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ผ่าน ${pass} / ล้มเหลว ${fail}`);
process.exit(fail === 0 ? 0 : 1);

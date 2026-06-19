// line-login.js — เปิด browser headed ไป login LINE OA Manager แล้ว save session
//   npm run scraper:login
// บันทึก session ไว้ที่ .storage/line-auth.json เพื่อให้ scraper.js ใช้ต่อ
try {
  require("dotenv").config();
} catch {}
const fs = require("fs");
const path = require("path");

const LINE_OA_URL = process.env.LINE_OA_URL || "https://chat.line.biz";
const STORAGE_DIR = path.join(__dirname, "..", ".storage");
const AUTH_FILE = path.join(STORAGE_DIR, "line-auth.json");

async function main() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    console.error(
      "\n❌ ไม่พบ playwright — รัน: npm install playwright && npx playwright install chromium",
    );
    process.exit(1);
  }

  if (!fs.existsSync(STORAGE_DIR))
    fs.mkdirSync(STORAGE_DIR, { recursive: true });

  console.log("\n🔐 เปิด browser เพื่อ login LINE OA Manager");
  console.log(`   → ${LINE_OA_URL}`);
  console.log("   1) login ด้วยบัญชีที่มีสิทธิ์ดูแชท");
  console.log(
    "   2) เมื่อเห็นรายการแชทแล้ว กลับมาที่หน้าต่างนี้แล้วกด Enter\n",
  );

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page
    .goto(LINE_OA_URL, { waitUntil: "domcontentloaded" })
    .catch(() => {});

  // ตรวจอัตโนมัติ: ถ้าเจอ chat list ให้ save ทันที, หรือรอผู้ใช้กด Enter
  const waitList = page
    .waitForSelector(".list-group-item-chat", { timeout: 0 })
    .then(() => "list")
    .catch(() => null);
  const waitEnter = new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve("enter"));
  });

  const reason = await Promise.race([waitList, waitEnter]);
  if (reason === "list") {
    console.log("✅ ตรวจพบรายการแชท — กำลังบันทึก session...");
    await page.waitForTimeout(1500);
  }

  await context.storageState({ path: AUTH_FILE });
  console.log(
    `\n💾 บันทึก session แล้ว: ${path.relative(process.cwd(), AUTH_FILE)}`,
  );
  console.log("   ต่อไปรัน: npm run scraper:watch\n");

  await browser.close().catch(() => {});
  process.exit(0);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});

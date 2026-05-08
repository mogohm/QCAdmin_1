/**
 * รันครั้งแรกครั้งเดียว: node login.js
 * เปิด browser ให้ login LINE OA Manager ด้วยตัวเอง
 * แล้วบันทึก session ไว้ใน auth.json สำหรับรันครั้งต่อไป
 */
const { chromium } = require('playwright');
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'auth.json');

(async () => {
  console.log('เปิด browser — กรุณา login LINE OA Manager ด้วยตัวเอง...');
  console.log('หลัง login เสร็จ กด Enter ในหน้าต่างนี้\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://chat.line.biz/');

  // รอให้ user login เอง
  process.stdout.write('กด Enter หลัง login สำเร็จแล้ว...');
  await new Promise(resolve => process.stdin.once('data', resolve));

  // ตรวจว่า login สำเร็จหรือยัง
  const url = page.url();
  if (url.includes('chat.line.biz') && !url.includes('signin')) {
    await context.storageState({ path: AUTH_FILE });
    console.log(`\n✅ บันทึก session แล้วที่ ${AUTH_FILE}`);
    console.log('รัน scraper ได้เลย: node scraper.js');
  } else {
    console.log('\n❌ ยังไม่ได้ login — ลองใหม่อีกครั้ง');
  }

  await browser.close();
  process.exit(0);
})();

/**
 * Debug: เปิด chat.line.biz แล้ว print DOM + screenshot
 * รัน: node debug.js
 */
require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'auth.json');

(async () => {
  if (!fs.existsSync(AUTH_FILE)) {
    console.error('❌ ไม่พบ auth.json — รัน: node login.js ก่อน');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page    = await context.newPage();

  console.log('เปิด chat.line.biz...');
  await page.goto('https://chat.line.biz/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  console.log('URL:', page.url());

  // screenshot
  await page.screenshot({ path: path.join(__dirname, 'debug-main.png'), fullPage: false });
  console.log('✅ screenshot → debug-main.png');

  // ดู links ทั้งหมดในหน้า
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.href)
      .filter(h => h.includes('chat.line.biz') || h.startsWith('http'))
      .slice(0, 30)
  );
  console.log('\n--- Links ในหน้า (30 แรก) ---');
  links.forEach(l => console.log(' ', l));

  // ดู sidebar / nav elements
  const sidebarInfo = await page.evaluate(() => {
    const info = [];
    // หา element ที่อาจเป็น chat list
    const candidates = document.querySelectorAll('[class*="chat"],[class*="Chat"],[class*="conversation"],[class*="Conversation"],[class*="room"],[class*="Room"],[class*="list"],[class*="List"]');
    candidates.forEach(el => {
      if (el.children.length > 0 && el.getBoundingClientRect().height > 0) {
        info.push({
          tag: el.tagName,
          class: el.className.slice(0, 80),
          children: el.children.length,
          text: el.textContent?.slice(0, 50),
        });
      }
    });
    return info.slice(0, 20);
  });
  console.log('\n--- Chat list candidates ---');
  sidebarInfo.forEach(e => console.log(`  <${e.tag} class="${e.class}"> children:${e.children} "${e.text}"`));

  // ลองหา links ที่มี user id pattern
  const userLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .map(a => ({ href: a.href, text: a.textContent?.trim().slice(0, 30) }))
      .filter(a => /\/U[a-f0-9]{32}/i.test(a.href) || /\/C[a-f0-9]{32}/i.test(a.href))
      .slice(0, 10)
  );
  console.log('\n--- User/Group links พบ ---');
  if (userLinks.length === 0) {
    console.log('  ❌ ไม่พบ link รูปแบบ /U.../C...');
    console.log('  ลองหา data attributes แทน...');
    const dataLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-chat-id],[data-user-id],[data-room-id],[data-mid]'))
        .map(el => ({ tag: el.tagName, attrs: el.getAttributeNames().join(','), text: el.textContent?.slice(0,30) }))
        .slice(0, 10)
    );
    dataLinks.forEach(d => console.log(`  ${d.tag} [${d.attrs}] "${d.text}"`));
  } else {
    userLinks.forEach(l => console.log(`  ${l.href} | "${l.text}"`));
  }

  console.log('\nกด Ctrl+C เพื่อปิด...');
  await new Promise(() => {}); // รอ manual close
})();

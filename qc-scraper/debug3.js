require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: path.join(__dirname, 'auth.json') });
  const page = await context.newPage();

  await page.goto('https://chat.line.biz/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // นับ chat items
  const count = await page.locator('.list-group-item-chat').count();
  console.log(`พบ ${count} chat items (.list-group-item-chat)`);

  // คลิก item แรกด้วย Playwright native click
  console.log('คลิก chat แรก...');
  await page.locator('.list-group-item-chat').first().click();
  await page.waitForTimeout(3000);

  console.log('URL:', page.url());
  await page.screenshot({ path: path.join(__dirname, 'debug3-chat.png') });
  console.log('screenshot → debug3-chat.png');

  // dump class names ของ message bubbles ในฝั่งขวา (chat panel)
  const bubbles = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      // เฉพาะ element ในฝั่งขวา (chat panel) x > 340
      if (r.left > 340 && r.width > 80 && r.height > 20 && r.height < 200 && el.className) {
        const cls = typeof el.className === 'string' ? el.className.slice(0, 100) : '';
        const text = el.innerText?.trim().slice(0, 50) || '';
        if (text && cls) results.push({ tag: el.tagName, cls, text, x: Math.round(r.left), w: Math.round(r.width) });
      }
    });
    const seen = new Set();
    return results.filter(r => { const k = r.cls; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 50);
  });

  console.log('\n=== Message bubbles (right panel x>340) ===');
  bubbles.forEach(b => console.log(`x=${b.x} w=${b.w} <${b.tag} class="${b.cls}">\n  "${b.text}"\n`));

  await new Promise(() => {});
})();

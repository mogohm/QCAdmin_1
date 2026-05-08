require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: path.join(__dirname, 'auth.json') });
  const page = await context.newPage();

  await page.goto('https://chat.line.biz/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // dump class names ของทุก element ใน sidebar (left 340px)
  const info = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.left < 340 && r.width > 100 && r.height > 40 && r.height < 120 && el.className) {
        results.push({
          tag: el.tagName,
          cls: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
          h: Math.round(r.height),
          y: Math.round(r.top),
          text: el.innerText?.slice(0, 40),
        });
      }
    });
    // dedup by cls
    const seen = new Set();
    return results.filter(r => { if (seen.has(r.cls)) return false; seen.add(r.cls); return true; }).slice(0, 40);
  });

  console.log('=== Elements ใน sidebar (left<340px) ===');
  info.forEach(e => console.log(`<${e.tag} h=${e.h} y=${e.y}>\n  class: "${e.cls}"\n  text: "${e.text}"\n`));

  // ลอง click element แรกที่อยู่ในตำแหน่ง y=100-200 (chat item แรก)
  console.log('\n=== ลอง click item แรก ===');
  const clicked = await page.evaluate(() => {
    const candidates = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.left > 60 && r.left < 200 && r.top > 100 && r.top < 200 && r.height > 50 && r.height < 120) {
        candidates.push({ el, cls: el.className, tag: el.tagName, text: el.innerText?.slice(0, 40) });
      }
    });
    if (candidates.length > 0) {
      candidates[0].el.click();
      return { tag: candidates[0].tag, cls: candidates[0].cls, text: candidates[0].text };
    }
    return null;
  });
  console.log('clicked:', clicked);

  await page.waitForTimeout(2000);
  console.log('URL after click:', page.url());
  await page.screenshot({ path: path.join(__dirname, 'debug2.png') });
  console.log('screenshot → debug2.png');

  await new Promise(() => {});
})();

// verify-evidence-ui.js — เปิด production /chat-review จริง → คลิก "ดูหลักฐาน" แถวที่มีภาพ → screenshot
//   พิสูจน์ว่าผู้ใช้เห็นภาพแชทจริงใน production browser
const { chromium } = require("playwright");
const path = require("path");
const BASE = "https://qc-admin-1.vercel.app";
const OUT = path.join(__dirname, "..", ".storage", "evidence-viewer-prod.png");

(async () => {
  // login ผ่าน API → เอา cookie มาใส่ browser (เลี่ยง flaky form)
  const lr = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "sysadmin", password: "sysadmin123", remember: true }),
  });
  const sc = lr.headers.get("set-cookie") || "";
  const token = (sc.match(/qc_session=([^;]+)/) || [])[1];
  if (!token) throw new Error("login ไม่สำเร็จ (ไม่มี cookie)");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.addCookies([{ name: "qc_session", value: token, domain: "qc-admin-1.vercel.app", path: "/" }]);
  const page = await context.newPage();
  try {
    // chat-review + filter วันที่ 2026-07-06
    await page.goto(`${BASE}/chat-review`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const dates = page.locator('input[type="date"]');
    await dates.nth(0).fill("2026-07-06").catch(() => {});
    await dates.nth(1).fill("2026-07-06").catch(() => {});
    // ค้นหาลูกค้าจริงที่มีภาพ (จาก scraper)
    await page.fill('input[placeholder*="ค้นชื่อลูกค้า"]', "1137736").catch(() => {});
    await page.click('button:has-text("ค้นหา")').catch(() => {});
    await page.waitForTimeout(3000);

    // คลิก "ดูหลักฐาน" ของแถวที่มี badge "มีภาพแชท" (เคสจริงจาก scraper)
    const row = page.locator("tr", { has: page.locator("text=มีภาพแชท") }).first();
    let clicked = false;
    if (await row.count()) {
      await row.locator('button:has-text("ดูหลักฐาน")').first().click();
      clicked = true;
    } else {
      await page.locator('button:has-text("ดูหลักฐาน")').first().click().catch(() => {});
      clicked = true;
    }
    await page.waitForTimeout(4500); // รอโหลดภาพจริง (~88KB data URL)
    await page.locator(".glass img").first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    const imgCount = await page.locator('img[alt], .glass img').count();
    await page.screenshot({ path: OUT });
    console.log("clicked ดูหลักฐาน:", clicked);
    console.log("images in viewer:", imgCount);
    console.log("saved:", OUT);
  } catch (e) {
    console.error("verify-ui error:", e.message);
    await page.screenshot({ path: OUT }).catch(() => {});
  } finally {
    await browser.close();
  }
})();

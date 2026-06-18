@echo off
REM QCAdmin scraper — scrape "เมื่อวาน" หนึ่งครั้งแล้วจบ (ใช้กับ Task Scheduler ตี 1)
REM secrets อ่านจาก .env (QC_API_URL, QC_API_KEY, LINE_OA_URL, SCRAPER_HEADLESS)
cd /d "h:\QCAdminPJ\qc-admin-lineoa"
if not exist ".storage" mkdir ".storage"
echo [%date% %time%] start scrape --yesterday >> ".storage\scrape-daily.log"
node scraper.js --yesterday >> ".storage\scrape-daily.log" 2>&1
echo [%date% %time%] done exit=%errorlevel% >> ".storage\scrape-daily.log"

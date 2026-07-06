@echo off
REM ============================================================
REM  scraper-live.bat — รัน scraper พร้อมแสดง log สดใน CMD + บันทึกลงไฟล์
REM ------------------------------------------------------------
REM  ใช้:
REM    scraper-live.bat --date=2026-07-05
REM    scraper-live.bat --yesterday
REM    scraper-live.bat --from=2026-07-01 --to=2026-07-05
REM    scraper-live.bat --watch --schedule=30
REM  ทุก log จะแสดงบนจอทันที (สด) และเก็บสำเนาไว้ที่ .storage\logs\scraper-<timestamp>.log
REM  หมายเหตุ: ระบบไม่เก็บ "วันนี้" — เลือกได้ถึงเมื่อวานเป็นอย่างช้าสุด
REM ============================================================
setlocal
cd /d "%~dp0"

REM สร้างโฟลเดอร์ log ถ้ายังไม่มี
if not exist ".storage\logs" mkdir ".storage\logs"

REM ตั้งชื่อไฟล์ log ตามเวลา (YYYYMMDD-HHMMSS)
for /f "tokens=1-6 delims=/:. " %%a in ("%date% %time%") do set TS=%%c%%b%%a-%%d%%e%%f
set LOGFILE=.storage\logs\scraper-%TS%.log

echo ============================================================
echo  QC Scraper — LIVE MODE
echo  args    : %*
echo  logfile : %LOGFILE%
echo ============================================================

REM รัน node แล้ว Tee-Object: แสดงสด + เขียนไฟล์พร้อมกัน
powershell -NoProfile -Command "node scraper.js %* 2>&1 | Tee-Object -FilePath '%LOGFILE%'"

echo.
echo ============================================================
echo  เสร็จสิ้น — log ถูกบันทึกไว้ที่ %LOGFILE%
echo ============================================================
endlocal

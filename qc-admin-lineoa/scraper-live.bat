@echo off
REM ============================================================
REM  scraper-live.bat — รัน scraper พร้อม log สด (UTF-8 console + ไฟล์)
REM ------------------------------------------------------------
REM  ใช้งานปกติ:   .\scraper-live.bat --watch
REM  ทดสอบ dev:    .\scraper-live.bat --date=YYYY-MM-DD --headed
REM  log เก็บที่:   .storage\logs\scraper-<timestamp>.log (UTF-8)
REM
REM  ไม่ใช้ PowerShell pipeline อีกต่อไป — WP5.1 เคย wrap stderr เป็น
REM  NativeCommandError ทำให้ error จริงอ่านไม่ออก  ตอนนี้ node runner
REM  (scripts\run-scraper-live.js) เป็นคน pipe console + log เอง
REM ============================================================
setlocal
cd /d "%~dp0"
chcp 65001 >nul
node scripts\run-scraper-live.js %*
endlocal

@echo off
chcp 65001 >nul
cd /d "%~dp0"
title QC Scraper - Daily Once

echo ==========================================
echo   QC Scraper - Daily (Yesterday) Once
echo   %date% %time%
echo ==========================================

if not exist auth.json (
  echo [!] ไม่พบ auth.json — ต้อง login ครั้งแรกก่อน: เปิด relogin.bat แล้ว login
  exit /b 1
)

node scraper.js --once
set EXIT_CODE=%errorlevel%

if %EXIT_CODE%==2 (
  echo.
  echo [!] Session หมดอายุ — เปิด relogin.bat เพื่อ login ใหม่ครั้งเดียว
)
echo [*] จบการทำงาน (exit %EXIT_CODE%) เวลา %time%
exit /b %EXIT_CODE%

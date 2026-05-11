@echo off
title QC Scraper
color 0A
echo.
echo  ==========================================
echo    QC Scraper - Auto Mode
echo    (แก้ SCHEDULE_MINUTES ใน .env เพื่อตั้งเวลา)
echo  ==========================================
echo.

if not exist auth.json (
  echo  [!] ยังไม่ได้ล็อกอิน LINE OA
  echo  [!] กรุณารัน: node login.js  ก่อน
  echo.
  pause
  exit /b 1
)

:run
node scraper.js
echo.
echo  ========================================
echo  Scraper หยุดทำงาน
echo  กด R เพื่อรันใหม่, หรือกด Enter เพื่อปิด
echo  ========================================
set /p choice="เลือก: "
if /i "%choice%"=="r" goto run
exit /b 0

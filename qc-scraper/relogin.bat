@echo off
title QC Scraper - Auto Relogin
color 0A
echo.
echo  ==========================================
echo    QC Scraper - Auto Relogin Mode
echo    (Login ใหม่อัตโนมัติเมื่อ Session หมดอายุ)
echo  ==========================================
echo.

if not exist auth.json (
  echo  [!] ยังไม่ได้ล็อกอิน LINE OA ครั้งแรก
  echo  [!] กำลังเปิด login...
  echo.
  node login.js
  if errorlevel 1 (
    echo  [!] Login ล้มเหลว
    pause
    exit /b 1
  )
)

:run
echo  [*] กำลังเริ่ม Scraper...
echo.
node scraper.js %*
set EXIT_CODE=%errorlevel%

echo.
if %EXIT_CODE%==2 (
  echo  ========================================
  echo  [!] Session หมดอายุ — เปิด browser เพื่อ Login ใหม่
  echo  ========================================
  echo.
  node login.js
  if errorlevel 1 (
    echo  [!] Login ล้มเหลว กด Enter เพื่อปิด
    pause
    exit /b 1
  )
  echo.
  echo  [*] Login สำเร็จ — เริ่ม Scraper ใหม่...
  echo.
  goto run
)

if %EXIT_CODE%==0 (
  echo  ========================================
  echo  Scraper หยุดทำงานปกติ
  echo  กด R เพื่อรันใหม่, หรือกด Enter เพื่อปิด
  echo  ========================================
) else (
  echo  ========================================
  echo  Scraper หยุดด้วย error code %EXIT_CODE%
  echo  กด R เพื่อรันใหม่, หรือกด Enter เพื่อปิด
  echo  ========================================
)
set /p choice="เลือก: "
if /i "%choice%"=="r" goto run
exit /b 0

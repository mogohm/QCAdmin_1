@echo off
REM ============================================================
REM  scraper-live.bat — รัน scraper พร้อม log สด (UTF-8 ทั้ง console และไฟล์)
REM ------------------------------------------------------------
REM  ใช้งานปกติ:   scraper-live.bat --watch
REM  ทดสอบ dev:    scraper-live.bat --date=YYYY-MM-DD --headed
REM  log เก็บที่:   .storage\logs\scraper-<timestamp>.log (UTF-8)
REM ============================================================
setlocal
cd /d "%~dp0"

REM ---- บังคับ UTF-8 ก่อน Node เริ่ม (ห้ามพึ่ง code page ไทย 874 ของเครื่อง) ----
chcp 65001 >nul
set PYTHONUTF8=1
set NODE_OPTIONS=--no-warnings

if not exist ".storage\logs" mkdir ".storage\logs"
for /f "tokens=1-6 delims=/:. " %%a in ("%date% %time%") do set TS=%%c%%b%%a-%%d%%e%%f
set LOGFILE=.storage\logs\scraper-%TS%.log

REM ---- เลือก console engine: PowerShell 7 (pwsh) UTF-8 เสถียรกว่า → fallback WP5.1 ----
where pwsh >nul 2>nul
if %errorlevel%==0 (
  echo Console engine: PowerShell 7
  echo Active code page: 65001 ^(UTF-8^)
  echo Log file: %LOGFILE%
  pwsh -NoProfile -ExecutionPolicy Bypass -Command ^
    "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false); [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); node scraper.js %* 2>&1 | Tee-Object -FilePath '%LOGFILE%'"
) else (
  echo Console engine: Windows PowerShell 5.1
  echo Active code page: 65001 ^(UTF-8^)
  echo Log file: %LOGFILE%
  REM WP5.1: Tee-Object เขียนไฟล์เป็น UTF-16 → ใช้ Add-Content -Encoding utf8 แทน
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false); [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); node scraper.js %* 2>&1 | ForEach-Object { $_; Add-Content -Path '%LOGFILE%' -Value $_ -Encoding utf8 }"
)

echo.
echo เสร็จสิ้น — log ถูกบันทึกไว้ที่ %LOGFILE%
endlocal

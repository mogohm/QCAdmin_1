#!/usr/bin/env node
// ============================================================
// scripts/run-scraper-live.js — ตัวรัน scraper แบบ live log (แทน PowerShell Tee pipeline)
// ------------------------------------------------------------
//   ทำไมต้องมี: Windows PowerShell 5.1 wrap stderr ของ native process เป็น
//   NativeCommandError ErrorRecord → error จริง ("LINE session expired ...")
//   จมอยู่ใต้ stack trace ปลอม  ตัวรันนี้ pipe stdout/stderr ตรง ๆ:
//     - โชว์บน console ตามจริง (ไม่มี wrapper)
//     - เขียนไฟล์ log UTF-8 (no BOM) ที่ .storage/logs/scraper-<ts>.log
//     - exit code = exit code จริงของ scraper.js
//     - Ctrl+C ส่งต่อให้ scraper ปิดตัวอย่างสุภาพ (lock/heartbeat cleanup)
//   ใช้ผ่าน: .\scraper-live.bat --watch   (bat แค่ chcp 65001 แล้วเรียกไฟล์นี้)
// ============================================================
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOG_DIR = path.join(ROOT, ".storage", "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

const ts = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace("T", "_")
  .slice(0, 19);
const LOG_FILE = path.join(LOG_DIR, `scraper-${ts}.log`);
const logStream = fs.createWriteStream(LOG_FILE, { encoding: "utf8" }); // UTF-8 no BOM

console.log(`Log file: ${LOG_FILE}`);

const child = spawn(process.execPath, [path.join(ROOT, "scraper.js"), ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: ["inherit", "pipe", "pipe"],
  env: process.env,
});

// stdout + stderr → console ตรง ๆ (ไม่มี NativeCommandError wrapper) + ไฟล์ log
child.stdout.on("data", (d) => {
  process.stdout.write(d);
  logStream.write(d);
});
child.stderr.on("data", (d) => {
  process.stderr.write(d);
  logStream.write(d);
});

// Ctrl+C: ส่งต่อให้ลูกปิดเอง (heartbeat/lock cleanup) — ตัวรันรอจนลูกจบจริง
process.on("SIGINT", () => {
  try {
    child.kill("SIGINT");
  } catch {}
});
process.on("SIGTERM", () => {
  try {
    child.kill("SIGTERM");
  } catch {}
});

child.on("close", (code, signal) => {
  logStream.end(() => {
    console.log(`\nเสร็จสิ้น — log ถูกบันทึกไว้ที่ ${LOG_FILE}`);
    process.exit(signal ? 130 : (code ?? 1)); // เก็บ exit code จริงของ scraper
  });
});
child.on("error", (e) => {
  console.error(`เปิด scraper ไม่สำเร็จ: ${e.message}`);
  process.exit(1);
});

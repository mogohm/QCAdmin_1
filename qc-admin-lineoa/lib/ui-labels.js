// ui-labels.js — ระบบแปล label กลาง (Thai-first) + helper format ค่า
//   ใช้ทุกหน้าเพื่อไม่ให้ raw key (creditDepositWithdraw ฯลฯ) หรือ [object Object] หลุดบน UI
//   คำที่ทีมคุ้น (KYC/SOP/AI/QC) คงไว้เป็นอังกฤษได้

// ---- หมวดคะแนน QC (category_code → ไทย) — รองรับทั้ง camelCase และ snake_case ----
export const CATEGORY_LABELS = {
  // camelCase (dimension_scores keys)
  creditDepositWithdraw: "ฝาก/ถอน/เครดิต",
  problemSolving: "การแก้ปัญหา",
  greetingClosing: "ทักทายและปิดเคส",
  communicationTone: "น้ำเสียงและความสุภาพ",
  responseTime: "ความเร็วในการตอบ",
  kycProcess: "ขั้นตอน KYC",
  upsellPromotion: "โปรโมชั่น/การแนะนำเพิ่ม",
  minorError: "ข้อผิดพลาดเล็กน้อย",
  fatalError: "ข้อผิดพลาดร้ายแรง",
  sopAccuracy: "ความถูกต้องตาม SOP",
  // snake_case (SQL alias / adminCategoryRanking keys)
  greeting_closing: "ทักทายและปิดเคส",
  problem_solving: "การแก้ปัญหา",
  communication_tone: "น้ำเสียงและความสุภาพ",
  response_time: "ความเร็วในการตอบ",
  credit_deposit_withdraw: "ฝาก/ถอน/เครดิต",
  kyc_process: "ขั้นตอน KYC",
  upsell_promotion: "โปรโมชั่น/การแนะนำเพิ่ม",
  minor_error: "ข้อผิดพลาดเล็กน้อย",
  fatal_error: "ข้อผิดพลาดร้ายแรง",
  sop_accuracy: "ความถูกต้องตาม SOP",
};

// แปลง snake_case → camelCase (เผื่อ key ที่ไม่อยู่ใน map)
function snakeToCamel(s) {
  return String(s).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// รหัสหมวดที่เป็น "โทษ" (ไม่ใช่มิติคะแนนปกติ) — ใช้กรองใน bottleneck
export const PENALTY_CODES = ["minorError", "fatalError"];

// รหัสมิติคะแนน 7 ตัว (ตาม rubric) — ใช้วนแสดงผลรายมิติ
export const DIMENSION_CODES = [
  "greetingClosing",
  "problemSolving",
  "communicationTone",
  "responseTime",
  "upsellPromotion",
  "creditDepositWithdraw",
  "kycProcess",
];

// ---- เมนู / หน้า ----
export const PAGE_LABELS = {
  "Admin Dashboard": "แดชบอร์ดแอดมิน",
  "Manager Dashboard": "แดชบอร์ดผู้จัดการ",
  Leaderboard: "จัดอันดับแอดมิน",
  "Marketing Dashboard": "แดชบอร์ดการตลาด",
  "QC Monitoring": "ตรวจสอบคุณภาพ",
  "Chat Review": "รีวิวแชท",
  "SOP Knowledge Base": "คลังความรู้ SOP",
  Disputes: "โต้แย้งคะแนน",
  "AI Review Queue": "คิวตรวจสอบ AI",
  "Manual Case": "เพิ่มเคสเอง",
  "AI Knowledge Training": "สอนความรู้ให้ AI",
  "System Events": "เหตุการณ์ระบบ",
  "Admin Performance": "ผลงานแอดมิน",
  Commission: "ค่าคอมมิชชั่น",
  Scraper: "ตัวดึงข้อมูล LINE OA",
  "User & Role Mgmt": "จัดการผู้ใช้และสิทธิ์",
  "Role Permissions": "สิทธิ์ของแต่ละบทบาท",
  "Registration Requests": "คำขอลงทะเบียน",
  Docs: "คู่มือใช้งาน",
};

// ---- Metric ----
export const METRIC_LABELS = {
  "AVG QA": "คะแนน QC เฉลี่ย",
  "Avg QA": "คะแนน QC เฉลี่ย",
  "QA Coverage": "สัดส่วนเคสที่ตรวจแล้ว",
  "SLA Pass": "ตอบทันตาม SLA",
  Fatal: "ข้อผิดพลาดร้ายแรง",
  Minor: "ข้อผิดพลาดเล็กน้อย",
  "Pending Disputes": "รอพิจารณาการโต้แย้ง",
  "Avg Response": "เวลาตอบเฉลี่ย",
  "Total Cases": "จำนวนเคสทั้งหมด",
  "Error Cases": "เคสผิดพลาด",
  "Estimated Commission": "ค่าคอมมิชชั่นโดยประมาณ",
};

// ---- บทบาท (role) ----
export const ROLE_LABELS = {
  system_admin: "ผู้ดูแลระบบ",
  manager: "ผู้จัดการ",
  leader: "หัวหน้าทีม",
  admin: "แอดมิน",
  marketing: "การตลาด",
};

// ---- สถานะ ----
export const STATUS_LABELS = {
  Excellent: "ดีเยี่ยม",
  Good: "ดี",
  Warning: "ต้องปรับปรุง",
  Critical: "วิกฤต",
  Pending: "รอตรวจสอบ",
  Approved: "อนุมัติแล้ว",
  Rejected: "ไม่อนุมัติ",
  Manual: "เคสเพิ่มเอง",
  Scraper: "เคสจาก LINE OA",
  Unknown: "ไม่ทราบ / AI ไม่มั่นใจ",
  pending: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  corrected: "แก้ไขแล้ว",
  not_relevant: "ไม่เกี่ยว QC",
  active: "ใช้งาน",
  disabled: "ปิดใช้งาน",
};

// ---- คำอธิบาย metric (ไทย) ----
export const METRIC_HELP = {
  "คะแนน QC เฉลี่ย":
    "คะแนนเฉลี่ยจากการประเมินคุณภาพการตอบแชทของแอดมิน โดย AI วัดจากความถูกต้องตาม SOP น้ำเสียง ความเร็ว และข้อผิดพลาด",
  สัดส่วนเคสที่ตรวจแล้ว:
    "เปอร์เซ็นต์ของเคสแชทที่ถูกนำมาตรวจคุณภาพ เทียบกับจำนวนเคสทั้งหมดในช่วงวันที่เลือก",
  "ตอบทันตาม SLA":
    "เปอร์เซ็นต์ของเคสที่แอดมินตอบภายในเวลาที่กำหนด เช่น ภายใน 5 นาที หรือเวลาที่ตั้งค่าไว้",
  ข้อผิดพลาดร้ายแรง:
    "เคสที่มีความผิดพลาดรุนแรง เช่น ให้ข้อมูลฝากถอนผิด ใช้คำไม่เหมาะสม เปิดเผยข้อมูลลูกค้า หรือทำให้ลูกค้าเสียความมั่นใจ",
  ข้อผิดพลาดเล็กน้อย:
    "ข้อผิดพลาดที่ไม่รุนแรง เช่น พิมพ์ตกหล่น ตอบไม่ครบ ไม่ปิดเคส หรือใช้คำลงท้ายไม่เหมาะสม",
  เวลาตอบเฉลี่ย: "เวลาเฉลี่ยตั้งแต่ลูกค้าส่งข้อความจนถึงแอดมินตอบกลับ",
  จุดที่ทีมทำพลาดบ่อย:
    "หมวดคะแนนที่มีจำนวนเคสผิดพลาดมากที่สุด ใช้ดูว่าทีมควรปรับปรุงเรื่องใดก่อน",
  จำนวนเคสทั้งหมด: "จำนวนบทสนทนาที่ถูกนำมาตรวจคุณภาพในช่วงวันที่เลือก",
  เคสผิดพลาด: "จำนวนเคสที่มีคะแนน QC ต่ำหรือมีข้อผิดพลาดตามที่ AI/QC ตรวจพบ",
  รอพิจารณาการโต้แย้ง: "จำนวนเคสที่แอดมินโต้แย้งคะแนนและรอหัวหน้าพิจารณา",
  ค่าคอมมิชชั่นโดยประมาณ:
    "ค่าคอมมิชชั่นที่ประเมินจากผลงานและคะแนน QC (ตัวเลขโดยประมาณ)",
  แนวโน้มคะแนนทีม:
    "กราฟแสดงคะแนน QC เฉลี่ยของทีมในแต่ละวัน เพื่อดูแนวโน้มขึ้น/ลง",
  ทักษะแอดมิน: "คะแนนรายมิติของแอดมิน (การแก้ปัญหา น้ำเสียง ความเร็ว ฯลฯ)",
};

// ---- helpers ----
export function label(key) {
  return PAGE_LABELS[key] || metricLabel(key);
}
export function categoryLabel(key) {
  if (key == null) return "-";
  // ลองตรง ๆ ก่อน แล้วลอง camelCase (รองรับ snake_case)
  return (
    CATEGORY_LABELS[key] || CATEGORY_LABELS[snakeToCamel(key)] || String(key)
  );
}
export function metricLabel(key) {
  return METRIC_LABELS[key] || STATUS_LABELS[key] || String(key ?? "-");
}
export function statusLabel(key) {
  if (key == null) return "-";
  return STATUS_LABELS[key] || String(key);
}
export function roleLabel(key) {
  if (key == null) return "-";
  return ROLE_LABELS[key] || String(key);
}
export function explainMetric(key) {
  // รับได้ทั้ง key ไทย (จาก metricLabel) และ key อังกฤษ
  return METRIC_HELP[key] || METRIC_HELP[metricLabel(key)] || "";
}

// เวลา (วินาที) → "x วินาที" / "x นาที"
export function formatDuration(seconds) {
  const s = Number(seconds || 0);
  if (!s || s <= 0) return "—";
  if (s < 60) return `${s} วินาที`;
  const m = Math.round((s / 60) * 10) / 10;
  return `${m} นาที`;
}

// คะแนน → ตัวเลข + tier (คงตัวเลขไว้ให้เห็น)
export function formatScore(score) {
  if (score == null || Number.isNaN(Number(score))) return "—";
  return String(Math.round(Number(score)));
}

// tier ไทยจากคะแนน
export function scoreTier(score) {
  const v = Number(score);
  if (Number.isNaN(v)) return "-";
  if (v >= 90) return "ดีเยี่ยม";
  if (v >= 80) return "ดี";
  if (v >= 70) return "ต้องปรับปรุง";
  return "วิกฤต";
}

// กันไม่ให้ object หลุดเป็น [object Object] บน UI
export function safeText(value) {
  if (value == null) return "-";
  if (typeof value === "string") return value || "-";
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((v) => safeText(v)).filter((s) => s && s !== "-");
    return parts.length ? parts.join(", ") : "-";
  }
  if (typeof value === "object") {
    // เลือก field ที่อ่านได้ก่อน
    const pick =
      value.reason ||
      value.fail_reason ||
      value.suggestion ||
      value.name ||
      value.label ||
      value.text ||
      value.topic;
    if (pick) return String(pick);
    try {
      const s = JSON.stringify(value);
      return s.length > 60 ? s.slice(0, 60) + "…" : s;
    } catch {
      return "-";
    }
  }
  return String(value);
}

// จำนวนเคสผิด → "ผิด n เคส"
export function formatFail(n) {
  return `ผิด ${Number(n || 0)} เคส`;
}

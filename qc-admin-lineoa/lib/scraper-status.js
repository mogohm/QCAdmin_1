// ============================================================
// lib/scraper-status.js — normalize สถานะ scraper job สำหรับ UI (banner + floating chip)
//   ใช้ทั้ง client component และ test (CommonJS)
//   กติกา:
//     - progress = ห้องที่เปิดแล้ว / ห้องเป้าหมาย (ไม่ใช่จำนวนข้อความ!) clamp 0..100
//     - field ใหม่จาก counters (JSONB) มาก่อน; fallback: total_chats→target, logged_count→messages
//     - ค่าไม่มี → 0 (ไม่ปล่อย undefined ให้ UI ว่าง)
// ============================================================

const n = (v) => (v == null || isNaN(Number(v)) ? 0 : Number(v));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// job = แถวจาก /api/scraper/job (มี counters JSONB + total_chats/logged_count/current_chat/mode/...)
function normalizeJobStatus(job) {
  if (!job) return null;
  const c = job.counters && typeof job.counters === "object" ? job.counters : {};
  const target = n(c.target_date_chats) || n(job.total_chats); // fallback ตาม contract เดิม
  const processed = n(c.processed_chats);
  const messages = n(c.messages_inserted) || n(job.logged_count);
  const skippedNewer = n(c.newer_chats_skipped ?? c.skipped_newer_chats);
  const skippedOld = n(c.older_chats_seen ?? c.skipped_too_old);
  const failed = n(c.failed_chats);
  const collected = n(c.collected_chats);
  const empty = n(c.empty_chats);
  const remaining = Math.max(target - processed, 0);
  // progress จากจำนวนห้องเท่านั้น — ห้ามใช้ข้อความ/รวมตัวเลขอื่น
  const pct = target > 0 ? clamp(Math.round((processed / target) * 100), 0, 100) : 0;
  return {
    status: job.status,
    mode: c.mode || job.mode || "strict",
    target,
    processed,
    remaining,
    messages,
    skippedNewer,
    skippedOld,
    skipped: skippedNewer + skippedOld,
    failed,
    collected,
    empty,
    pct,
    roomsLabel: `${processed} / ${target} ห้อง (${pct}%)`,
    currentChat: job.current_chat || null,
    currentStep: c.current_step || null,
    startedAt: job.started_at || null,
    updatedAt: job.updated_at || null,
    dateFrom: job.date_from || null,
    dateTo: job.date_to || null,
  };
}

// ป้ายขั้นตอนภาษาไทย
function stepLabel(step) {
  return (
    {
      scanning: "สแกนรายชื่อห้อง",
      opening: "กำลังเปิดห้อง",
      parsing: "อ่านข้อความ",
      saving: "บันทึกข้อความ",
      pairing: "จับคู่ QC",
      collecting: "เก็บข้อมูลห้อง",
      done: "เสร็จสิ้น",
    }[step] || (step ? String(step) : "—")
  );
}

module.exports = { normalizeJobStatus, stepLabel };

// ============================================================
// /api/scraper/worker-status — สถานะ worker จาก "heartbeat จริง" เท่านั้น
// ------------------------------------------------------------
//   สำคัญ: online มาจาก heartbeat ที่ process scraper ส่งเอง —
//   ห้ามอนุมานจากการมี job active ใน DB (job ค้างได้แม้เครื่องปิดไปแล้ว)
//
//   POST  (x-api-key, จาก worker): upsert heartbeat → คืน desired_state (running|draining)
//   GET   (session scraper.view): worker ล่าสุด + online = heartbeat < 45s
//   PATCH (session scraper.run): สั่ง desired_state = draining|running ("หยุดรับงานใหม่")
// ============================================================
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { guard } from "@/lib/permissions";
import { isWorkerOnline, workerPanelState } from "@/lib/scraper-status";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// worker ส่ง heartbeat ทุก ~12 วิ
export async function POST(req) {
  if (!requireAdmin(req))
    return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const b = await req.json().catch(() => ({}));
  if (!b.worker_id)
    return Response.json({ error: "worker_id required" }, { status: 400, headers: CORS });
  try {
    const rows = await query`
      INSERT INTO scraper_workers (worker_id, machine_name, pid, mode, status,
        current_job_id, current_chat, current_step, line_session_status, health,
        started_at, last_heartbeat_at, last_job_received_at, app_version, git_commit)
      VALUES (${b.worker_id}, ${b.machine_name || null}, ${b.pid || null}, ${b.mode || null}, ${b.status || "online"},
        ${b.current_job_id || null}, ${b.current_chat || null}, ${b.current_step || null},
        ${b.line_session_status || null}, ${b.health ? JSON.stringify(b.health) : null},
        ${b.started_at || null}, now(), ${b.last_job_received_at || null},
        ${b.app_version || null}, ${b.git_commit || null})
      ON CONFLICT (worker_id) DO UPDATE SET
        machine_name = EXCLUDED.machine_name, pid = EXCLUDED.pid, mode = EXCLUDED.mode,
        status = EXCLUDED.status, current_job_id = EXCLUDED.current_job_id,
        current_chat = EXCLUDED.current_chat, current_step = EXCLUDED.current_step,
        line_session_status = EXCLUDED.line_session_status,
        health = COALESCE(EXCLUDED.health, scraper_workers.health),
        started_at = COALESCE(scraper_workers.started_at, EXCLUDED.started_at),
        last_heartbeat_at = now(),
        last_job_received_at = COALESCE(EXCLUDED.last_job_received_at, scraper_workers.last_job_received_at),
        app_version = EXCLUDED.app_version
      RETURNING worker_id, desired_state, session_check_requested`;
    const checkRequested = rows[0]?.session_check_requested === true;
    // ส่งคำสั่ง "ตรวจ session" ให้ worker ครั้งเดียว แล้วเคลียร์ flag ทันที (ไม่ยิงซ้ำทุก heartbeat)
    if (checkRequested)
      await query`
        UPDATE scraper_workers SET session_check_requested = false
        WHERE worker_id = ${rows[0].worker_id}`;
    return Response.json(
      {
        ok: true,
        desired_state: rows[0]?.desired_state || "running",
        session_check_requested: checkRequested,
      },
      { headers: CORS },
    );
  } catch (e) {
    console.error("[worker-status POST]", e.message);
    return Response.json({ error: "บันทึก heartbeat ไม่สำเร็จ" }, { status: 500, headers: CORS });
  }
}

// UI อ่านสถานะ — online จาก heartbeat จริงเท่านั้น
export async function GET(req) {
  const gate = guard(req, "scraper.view", "scraper.run");
  if (gate) return gate;
  try {
    const rows = await query`
      SELECT * FROM scraper_workers ORDER BY last_heartbeat_at DESC NULLS LAST LIMIT 1`;
    const w = rows[0] || null;
    const online = w ? isWorkerOnline(w.last_heartbeat_at) : false;
    if (!w || !online)
      return Response.json({ online: false, worker: null, last_seen: w?.last_heartbeat_at || null, machine_name: w?.machine_name || null });
    return Response.json({
      online: true,
      state: workerPanelState(w),
      worker: {
        worker_id: w.worker_id,
        machine_name: w.machine_name,
        pid: w.pid,
        mode: w.mode,
        status: w.status,
        desired_state: w.desired_state,
        current_job_id: w.current_job_id,
        current_chat: w.current_chat,
        current_step: w.current_step,
        line_session_status: w.line_session_status,
        health: w.health,
        started_at: w.started_at,
        last_heartbeat_at: w.last_heartbeat_at,
        last_job_received_at: w.last_job_received_at,
        app_version: w.app_version,
        git_commit: w.git_commit,
      },
    });
  } catch (e) {
    console.error("[worker-status GET]", e.message);
    return Response.json({ online: false, worker: null, error: "โหลดสถานะไม่สำเร็จ" }, { status: 500 });
  }
}

// system_admin/scraper.run: หยุดรับงานใหม่ (draining) / กลับมารับงาน (running)
//   + { request_session_check: true } = สั่งให้ worker ตรวจ LINE Session จริง (Vercel ไม่มี browser session — worker เป็นผู้ตรวจ)
export async function PATCH(req) {
  const gate = guard(req, "scraper.run", "scraper.schedule");
  if (gate) return gate;
  const b = await req.json().catch(() => ({}));
  try {
    if (b.request_session_check === true) {
      const rows = await query`
        UPDATE scraper_workers SET session_check_requested = true
        WHERE worker_id = COALESCE(${b.worker_id || null}, (SELECT worker_id FROM scraper_workers ORDER BY last_heartbeat_at DESC NULLS LAST LIMIT 1))
        RETURNING worker_id, last_heartbeat_at`;
      if (!rows[0]) return Response.json({ error: "ไม่พบ worker" }, { status: 404 });
      if (!isWorkerOnline(rows[0].last_heartbeat_at))
        return Response.json(
          { error: "Worker ออฟไลน์ — ต้องเปิด worker (.\\scraper-live.bat --watch) ก่อนจึงตรวจ Session ได้" },
          { status: 409 },
        );
      return Response.json({ ok: true, requested: true, worker_id: rows[0].worker_id });
    }
    const ds = b.desired_state === "draining" ? "draining" : "running";
    const rows = await query`
      UPDATE scraper_workers SET desired_state = ${ds}
      WHERE worker_id = COALESCE(${b.worker_id || null}, (SELECT worker_id FROM scraper_workers ORDER BY last_heartbeat_at DESC NULLS LAST LIMIT 1))
      RETURNING worker_id, desired_state`;
    if (!rows[0]) return Response.json({ error: "ไม่พบ worker" }, { status: 404 });
    return Response.json({ ok: true, ...rows[0] });
  } catch (e) {
    console.error("[worker-status PATCH]", e.message);
    return Response.json({ error: "สั่งงานไม่สำเร็จ" }, { status: 500 });
  }
}

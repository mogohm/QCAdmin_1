import { query } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const allow = (req) => requirePermission(req, "system.events.manage");

// GET — list system events (active ก่อน) — ต้องดู QC ได้หรือจัดการ system events
export async function GET(req) {
  if (!requirePermission(req, "system.events.manage", "qc.monitor.view"))
    return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const rows =
      await query`SELECT * FROM system_events ORDER BY is_active DESC, starts_at DESC LIMIT 100`;
    const active = rows.filter(
      (r) => r.is_active && (!r.ends_at || new Date(r.ends_at) >= new Date()),
    );
    return Response.json({ events: rows, active });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST — create
export async function POST(req) {
  if (!allow(req))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.title)
    return Response.json({ error: "title required" }, { status: 400 });
  try {
    const rows = await query`
      INSERT INTO system_events (title, description, event_type, affects_sla, starts_at, ends_at, is_active)
      VALUES (${b.title}, ${b.description || null}, ${b.event_type || "system"},
              ${b.affects_sla !== false}, ${b.starts_at || new Date().toISOString()}::timestamptz,
              ${b.ends_at || null}, ${b.is_active !== false})
      RETURNING *`;
    return Response.json({ ok: true, event: rows[0] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
// rev: 2026-06-19 file-integrity (LF, multi-line verified)

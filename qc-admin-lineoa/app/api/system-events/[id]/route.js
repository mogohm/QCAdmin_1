import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { readSession } from "@/lib/session";

function allow(req) {
  if (requireAdmin(req)) return true;
  const s = readSession(req);
  return s && s.role === "manager";
}

// PATCH — update (ปิด event / แก้เวลา)
export async function PATCH(req, { params }) {
  if (!allow(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  try {
    const rows = await query`
      UPDATE system_events SET
        title       = COALESCE(${b.title ?? null}, title),
        description = COALESCE(${b.description ?? null}, description),
        event_type  = COALESCE(${b.event_type ?? null}, event_type),
        affects_sla = COALESCE(${b.affects_sla ?? null}, affects_sla),
        starts_at   = COALESCE(${b.starts_at ?? null}::timestamptz, starts_at),
        ends_at     = COALESCE(${b.ends_at ?? null}::timestamptz, ends_at),
        is_active   = COALESCE(${b.is_active ?? null}, is_active)
      WHERE id = ${id} RETURNING *`;
    if (!rows[0]) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ ok: true, event: rows[0] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

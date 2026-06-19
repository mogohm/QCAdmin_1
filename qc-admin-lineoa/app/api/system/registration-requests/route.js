import { query } from "@/lib/db";
import { guard } from "@/lib/permissions";

// GET /api/system/registration-requests?status=pending
export async function GET(req) {
  const g = guard(req, "system.users.create", "system.users.view");
  if (g) return g;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "pending";
  const rows =
    await query`SELECT id, username, display_name, email, requested_role, linked_admin_name, note, status,
                                  reviewed_by, reviewed_at, created_at
       FROM user_registration_requests
       WHERE (${status}::text = 'all' OR status = ${status})
       ORDER BY created_at DESC LIMIT 200`.catch(() => []);
  return Response.json({ requests: rows });
}

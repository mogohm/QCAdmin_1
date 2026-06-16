import { query } from "@/lib/db";
import { requireView, unauthorized } from "@/lib/guard";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req) {
  if (!requireView(req)) return unauthorized();
  try {
    const rows = await query`
      SELECT id, member_name FROM qc_admins
      WHERE is_active = true
      ORDER BY member_name
    `;
    return Response.json(rows, { headers: CORS });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500, headers: CORS });
  }
}

import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// POST — บันทึก Note ที่ scraper ดึงมาจาก LINE OA
export async function POST(req) {
  if (!requireAdmin(req))
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: CORS },
    );

  const { line_user_id, note_text, noted_at, noted_by } = await req.json();
  if (!line_user_id || !note_text)
    return Response.json(
      { error: "line_user_id, note_text required" },
      { status: 400, headers: CORS },
    );

  // ตรวจสอบ/สร้าง customer ก่อน
  await query`
    INSERT INTO line_customers (line_user_id) VALUES (${line_user_id})
    ON CONFLICT (line_user_id) DO NOTHING
  `;

  // หา admin_id จากชื่อถ้ามี
  let adminId = null;
  if (noted_by) {
    const found = await query`
      SELECT id FROM qc_admins
      WHERE lower(member_name) LIKE ${"%" + noted_by.toLowerCase() + "%"} AND is_active = true
      LIMIT 1
    `;
    adminId = found[0]?.id || null;
  }

  // บันทึก note — ป้องกัน duplicate ด้วย UNIQUE(line_user_id, note_text, noted_at)
  const notedAtVal = noted_at || null;
  const result = notedAtVal
    ? await query`
        INSERT INTO customer_notes (line_user_id, note_text, noted_at, noted_by, admin_id)
        VALUES (${line_user_id}, ${note_text}, ${notedAtVal}::timestamptz, ${noted_by || null}, ${adminId})
        ON CONFLICT (line_user_id, note_text, noted_at) DO NOTHING
        RETURNING id
      `
    : await query`
        INSERT INTO customer_notes (line_user_id, note_text, noted_by, admin_id)
        SELECT ${line_user_id}, ${note_text}, ${noted_by || null}, ${adminId}
        WHERE NOT EXISTS (
          SELECT 1 FROM customer_notes
          WHERE line_user_id = ${line_user_id} AND note_text = ${note_text} AND noted_at IS NULL
        )
        RETURNING id
      `;

  return Response.json(
    { ok: true, inserted: result.length > 0 },
    { headers: CORS },
  );
}

// GET — ดึง notes ทั้งหมดของ user
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("line_user_id");
  if (!uid)
    return Response.json(
      { error: "line_user_id required" },
      { status: 400, headers: CORS },
    );

  const notes = await query`
    SELECT cn.id, cn.note_text, cn.noted_at, cn.noted_by, cn.scraped_at,
           a.member_name AS admin_name
    FROM customer_notes cn
    LEFT JOIN qc_admins a ON a.id = cn.admin_id
    WHERE cn.line_user_id = ${uid}
    ORDER BY cn.noted_at DESC NULLS LAST, cn.scraped_at DESC
  `;
  return Response.json(notes, { headers: CORS });
}

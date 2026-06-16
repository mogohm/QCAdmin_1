import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { isPkName, normalizeAdminName } from "@/lib/admin-name";

// นำเข้ารายชื่อ admin — รับเฉพาะชื่อที่เป็น "PK" จริง (รองรับ Unicode/emoji/decorative)
// return { ok, imported, skipped, duplicated, errors, admins:[] }
export async function POST(req) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const rawText = body.text || body.adminText || body.names || "";
    const lines = String(rawText)
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);

    const result = { ok: true, imported: 0, skipped: 0, duplicated: 0, errors: [], admins: [] };
    const seen = new Set();

    for (const name of lines) {
      if (!isPkName(name)) {
        result.skipped++;
        continue;
      }

      // normalized_name สำหรับ dedup/conflict — ใช้ normalizeAdminName ตัวเดียว
      const normalizedName = normalizeAdminName(name).toLowerCase();
      if (seen.has(normalizedName)) {
        result.duplicated++;
        continue;
      }
      seen.add(normalizedName);

      try {
        const rows = await query`
          INSERT INTO qc_admins (member_name, normalized_name, is_active, source, created_at)
          VALUES (${name}, ${normalizedName}, true, 'line_oa_manage_permissions', now())
          ON CONFLICT (normalized_name)
          DO UPDATE SET is_active = true, member_name = EXCLUDED.member_name
          RETURNING (xmax = 0) AS inserted, id, member_name
        `;
        if (rows[0]?.inserted) {
          result.imported++;
          result.admins.push(rows[0].member_name);
        } else {
          result.duplicated++;
        }
      } catch (e) {
        result.errors.push({ name, error: String(e.message || e) });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Import admin error:", err);
    return NextResponse.json(
      { ok: false, imported: 0, skipped: 0, duplicated: 0, errors: [String(err.message || err)], admins: [] },
      { status: 500 },
    );
  }
}

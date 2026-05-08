import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function isPkAdmin(name) {
  const n = String(name || "").trim();

  return (
    /^PK/i.test(n) ||
    /^ᴘᴋ/i.test(n) ||
    /^🅿🅺/u.test(n) ||
    /𝓟𝓚/u.test(n)
  );
}

export async function POST(req) {
  try {
    const body = await req.json();
    const rawText = body.text || body.adminText || body.names || "";

    const lines = rawText
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean);

    const pkAdmins = lines.filter(isPkAdmin);

    for (const name of pkAdmins) {
  const normalizedName = name.trim().toLowerCase();

  await query(
    `insert into qc_admins (member_name, normalized_name, is_active, source, created_at)
     values ($1, $2, true, 'line_oa_manage_permissions', now())
     on conflict (normalized_name)
     do update set is_active = true`,
    [name, normalizedName]
  );
}

    return NextResponse.json({
      ok: true,
      imported: pkAdmins.length,
      skipped: lines.length - pkAdmins.length,
      admins: pkAdmins
    });
  } catch (err) {
    console.error("Import admin error:", err);
    return NextResponse.json(
      { ok: false, error: String(err.message || err) },
      { status: 500 }
    );
  }
}
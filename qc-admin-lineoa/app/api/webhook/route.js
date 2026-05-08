import { NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db";
import { getLineProfile } from "@/lib/line";

function verifySignature(rawBody, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET || "";
  if (!secret) {
    console.error("Missing LINE_CHANNEL_SECRET");
    return false;
  }
  const hash = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  return hash === signature;
}

export async function POST(req) {
  try {
    const raw = await req.text();
    const signature = req.headers.get("x-line-signature") || "";

    let body = {};
    try {
      body = JSON.parse(raw || "{}");
    } catch (e) {
      console.error("Invalid JSON body", e);
      return NextResponse.json({ ok: true, note: "Invalid JSON ignored" }, { status: 200 });
    }

    if (Array.isArray(body.events) && body.events.length === 0) {
      return NextResponse.json({ ok: true, verify: true }, { status: 200 });
    }

    if (!verifySignature(raw, signature)) {
      console.error("LINE signature invalid");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    for (const ev of body.events || []) {
      const userId = ev?.source?.userId || null;
      const eventType = ev?.type || null;
      const messageType = ev?.message?.type || null;
      const text = ev?.message?.text || "";

      if (!userId) continue;

      // 1. Upsert line_customers (FK required before conversations)
      const profile = await getLineProfile(userId).catch(() => null);
      await query`
        INSERT INTO line_customers (line_user_id, display_name, picture_url, last_seen_at)
        VALUES (
          ${userId},
          ${profile?.displayName || null},
          ${profile?.pictureUrl || null},
          now()
        )
        ON CONFLICT (line_user_id)
        DO UPDATE SET last_seen_at = now(),
          display_name = COALESCE(EXCLUDED.display_name, line_customers.display_name),
          picture_url  = COALESCE(EXCLUDED.picture_url,  line_customers.picture_url)
      `;

      if (eventType === "message" && messageType === "text") {
        // 2. Find open conversation or create new one
        const existing = await query`
          SELECT id FROM conversations
          WHERE line_user_id = ${userId} AND status = 'open'
          ORDER BY opened_at DESC
          LIMIT 1
        `;

        let convId;
        if (existing.length > 0) {
          convId = existing[0].id;
        } else {
          const newConv = await query`
            INSERT INTO conversations (line_user_id, status)
            VALUES (${userId}, 'open')
            RETURNING id
          `;
          convId = newConv[0].id;
        }

        // 3. Insert message
        await query`
          INSERT INTO messages (conversation_id, line_user_id, direction, message_text, line_message_id)
          VALUES (
            ${convId},
            ${userId},
            'customer',
            ${text},
            ${ev?.message?.id || null}
          )
        `;
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    // Still return 200 so LINE doesn't retry
    return NextResponse.json({ ok: true, error: String(err.message || err) }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: true, message: "LINE webhook endpoint is running. Use POST from LINE." },
    { status: 200 }
  );
}

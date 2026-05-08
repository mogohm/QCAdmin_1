import { NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db";

function verifySignature(rawBody, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET || "";

  if (!secret) {
    console.error("Missing LINE_CHANNEL_SECRET");
    return false;
  }

  const hash = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

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

      await query(
        `insert into line_events
          (line_user_id, event_type, message_type, message_text, raw_json, created_at)
         values
          ($1, $2, $3, $4, $5, now())`,
        [userId, eventType, messageType, text, JSON.stringify(ev)]
      );

      if (eventType === "message" && messageType === "text" && userId) {
        await query(
          `insert into conversations
            (line_user_id, customer_message, status, created_at, updated_at)
           values
            ($1, $2, 'OPEN', now(), now())`,
          [userId, text]
        );
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { ok: true, error: "Webhook error handled" },
      { status: 200 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: true, message: "LINE webhook endpoint is running. Use POST from LINE." },
    { status: 200 }
  );
}

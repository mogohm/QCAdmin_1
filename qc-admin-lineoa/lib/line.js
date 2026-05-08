import crypto from 'crypto';

export function verifyLineSignature(rawBody, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET || '';
  if (!secret || !signature) return false;
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

export async function pushLineText(to, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is missing');
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] })
  });
  if (!res.ok) throw new Error(`LINE push failed ${res.status}: ${await res.text()}`);
  return true;
}

export async function getLineProfile(userId) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  return res.json();
}

// Session + password — HMAC-signed cookie token + scrypt password hashing
import crypto from "crypto";

const SECRET =
  process.env.SESSION_SECRET ||
  process.env.ADMIN_API_KEY ||
  "qc-admin-default-secret";
const COOKIE = "qc_session";
const MAX_AGE = 7 * 24 * 3600; // 7 วัน

export function sign(payload) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + MAX_AGE * 1000 }),
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verify(token) {
  if (!token) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const expect = crypto
    .createHmac("sha256", SECRET)
    .update(body)
    .digest("base64url");
  if (
    sig.length !== expect.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))
  )
    return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch {
    return null;
  }
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(String(pw), salt, 32).toString("hex");
  return `${h}:${salt}`;
}

export function verifyPassword(pw, stored) {
  const [h, salt] = String(stored || "").split(":");
  if (!h || !salt) return false;
  const h2 = crypto.scryptSync(String(pw), salt, 32).toString("hex");
  return (
    h.length === h2.length &&
    crypto.timingSafeEqual(Buffer.from(h), Buffer.from(h2))
  );
}

export function cookieHeader(token) {
  const maxAge = token ? MAX_AGE : 0;
  return `${COOKIE}=${token || ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function readSession(req) {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? verify(m[1]) : null;
}

export const SESSION_COOKIE = COOKIE;

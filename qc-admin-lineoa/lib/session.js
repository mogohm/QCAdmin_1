// Session + password — HMAC-signed cookie token + scrypt password hashing
import crypto from "crypto";

const SECRET =
  process.env.SESSION_SECRET ||
  process.env.ADMIN_API_KEY ||
  "qc-admin-default-secret";
const COOKIE = "qc_session";
const MAX_AGE = 7 * 24 * 3600; // default 7 วัน
export const REMEMBER_AGE = 30 * 24 * 3600; // จดจำการเข้าสู่ระบบ = 30 วัน
export const SHORT_AGE = 12 * 3600; // ไม่จดจำ = 12 ชม.

// sign(payload, maxAgeSec) — ฝัง exp ตาม maxAge (mobile: อายุยาวขึ้นถ้า remember me)
export function sign(payload, maxAgeSec = MAX_AGE) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + maxAgeSec * 1000 }),
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

// cookieHeader(token, maxAgeSec) — mobile-safe: HttpOnly, SameSite=Lax, Secure (prod), Path=/
export function cookieHeader(token, maxAgeSec = MAX_AGE) {
  const maxAge = token ? maxAgeSec : 0;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${token || ""}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAge}`;
}

export function readSession(req) {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? verify(m[1]) : null;
}

export const SESSION_COOKIE = COOKIE;

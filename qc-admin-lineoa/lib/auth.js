export function requireAdmin(req) {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return true;
  return req.headers.get('x-api-key') === key;
}

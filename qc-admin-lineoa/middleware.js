import { NextResponse } from "next/server";

// ป้องกันหน้าเว็บ: ถ้าไม่มี session cookie → เด้งไป /login (กัน dashboard ขึ้น 0 ตอน logged-out)
//   ตรวจแค่ว่ามี cookie ไหม (verify จริงอยู่ที่ API); login/_next/ไฟล์ static ผ่านได้
const PUBLIC_PATHS = ["/login", "/register", "/forbidden"];

export function middleware(req) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".") ||
    PUBLIC_PATHS.includes(pathname)
  ) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.get("qc_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // ครอบทุก path ยกเว้น api / static asset
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, isAuthed } from "@/lib/auth";

// Everything except /api/poll (own secret), Next internals, and static assets.
export const config = {
  matcher: ["/((?!api/poll|_next/static|_next/image|favicon.ico).*)"],
};

export function proxy(req: NextRequest) {
  const secret = process.env.PORTAL_SECRET ?? "";
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (isAuthed(cookie, secret)) return NextResponse.next();

  const k = req.nextUrl.searchParams.get("k");
  if (k && k === secret) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("k");
    const res = NextResponse.redirect(url);
    res.cookies.set(AUTH_COOKIE, secret, {
      httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  }

  return new NextResponse("403 — acesso restrito", { status: 403 });
}

import { NextResponse, type NextRequest } from "next/server";

/*
 * Signed-out visitors to private areas are sent to sign in with a real redirect,
 * before anything renders (a page that redirects after it has started streaming
 * can only do so in the browser).
 *
 * This is a cheap first pass — "is there a session cookie at all?" — not the
 * check that matters: pages verify the session themselves (requireUser), so a
 * stale or forged cookie passes through here and is turned away there. Server
 * actions (POST) are left alone to answer in their own terms ("you've been signed
 * out"), and verify the session like every other server action.
 */

/** Areas that need a signed-in visitor. The admin area joins this list (and the matcher below). */
const PROTECTED_PREFIXES = ["/account"];

/** Pages inside those areas that everyone must reach. */
const PUBLIC_PREFIXES = ["/account/sign-in"];

/** Auth.js's session cookie: "__Secure-" prefixed on HTTPS, plain on http://localhost. */
const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

function within(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function hasSessionCookie(request: NextRequest): boolean {
  // Auth.js splits an oversized cookie into ".0", ".1"… chunks; count those too.
  return request.cookies
    .getAll()
    .some(({ name }) => SESSION_COOKIES.some((cookie) => name === cookie || name.startsWith(`${cookie}.`)));
}

export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => within(pathname, prefix));
  const isPublic = PUBLIC_PREFIXES.some((prefix) => within(pathname, prefix));
  if (!isProtected || isPublic || hasSessionCookie(request)) return NextResponse.next();

  // The sign-in page checks this is a same-site path before using it.
  const signIn = new URL("/account/sign-in", request.url);
  signIn.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(signIn, 307);
}

export const config = {
  // Must be literal for Next to read at build time; keep in step with the prefixes above.
  matcher: ["/account", "/account/((?!sign-in).*)"],
};

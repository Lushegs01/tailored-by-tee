import { NextResponse, type NextRequest } from "next/server";

import { signInRedirectFor } from "@/lib/auth/private-areas";

/*
 * Signed-out visitors to private areas are sent to sign in with a real redirect,
 * before anything renders (a page that redirects after it has started streaming
 * can only do so in the browser). The decision, and which areas are private,
 * live in lib/auth/private-areas; pages still verify the session themselves.
 */

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signIn = signInRedirectFor({
    method: request.method,
    pathname,
    search,
    cookieNames: request.cookies.getAll().map(({ name }) => name),
  });
  return signIn ? NextResponse.redirect(new URL(signIn, request.url), 307) : NextResponse.next();
}

export const config = {
  // Must be literal for Next to read at build time; keep in step with PROTECTED_PREFIXES and
  // PUBLIC_PREFIXES (the admin area adds "/admin", "/admin/:path*" here).
  matcher: ["/account", "/account/((?!sign-in).*)"],
};

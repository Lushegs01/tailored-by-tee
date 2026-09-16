/*
 * Which requests the proxy (src/proxy.ts) sends to sign in before anything
 * renders. Kept free of Next imports so the decision can be tested on its own.
 *
 * This is a cheap first pass — "is there a session cookie at all?" — not the
 * check that matters: pages verify the session themselves (requireUser), so a
 * stale or forged cookie passes through here and is turned away there.
 */

/** Areas that need a signed-in visitor. The admin area joins this list (and the proxy's matcher). */
export const PROTECTED_PREFIXES: readonly string[] = ["/account"];

/** Pages inside those areas that everyone must reach. */
export const PUBLIC_PREFIXES: readonly string[] = ["/account/sign-in"];

/** Auth.js's session cookie: "__Secure-" prefixed on HTTPS, plain on http://localhost. */
const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

function within(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function hasSessionCookie(cookieNames: readonly string[]): boolean {
  // Auth.js splits an oversized cookie into ".0", ".1"… chunks; count those too.
  return cookieNames.some((name) =>
    SESSION_COOKIES.some((cookie) => name === cookie || name.startsWith(`${cookie}.`)),
  );
}

export interface ProxiedRequest {
  method: string;
  pathname: string;
  /** The query string, with its "?" (or empty). */
  search: string;
  cookieNames: readonly string[];
}

/**
 * The sign-in page to send this request to (coming back to where it was going),
 * or null to let it through. Only page loads are redirected: server actions (POST)
 * answer in their own terms ("you've been signed out") and check the session like
 * every other server action.
 */
export function signInRedirectFor({ method, pathname, search, cookieNames }: ProxiedRequest): string | null {
  if (method !== "GET" && method !== "HEAD") return null;
  if (!PROTECTED_PREFIXES.some((prefix) => within(pathname, prefix))) return null;
  if (PUBLIC_PREFIXES.some((prefix) => within(pathname, prefix))) return null;
  if (hasSessionCookie(cookieNames)) return null;
  // The sign-in page checks this is a same-site path before using it.
  return `/account/sign-in?${new URLSearchParams({ callbackUrl: `${pathname}${search}` })}`;
}

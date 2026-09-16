/*
 * The decisions inside Auth.js's callbacks and its route, kept free of Next and
 * Auth.js runtime imports so they can be tested on their own (src/auth.ts and
 * the /api/auth route wire them in).
 */

/**
 * Auth.js POST endpoints the site keeps closed: starting a sign-in over HTTP
 * (/api/auth/signin and /api/auth/signin/<provider>). The site's own buttons are
 * server actions that call Auth.js in-process, so these would only ever be a way
 * round their validation — a script could otherwise mint sign-in emails to any
 * address. Callbacks, sign-out and the session endpoint stay open.
 */
export function isClosedAuthPost(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  return path === "/api/auth/signin" || path.startsWith("/api/auth/signin/");
}

/** The user as the session callback receives it from the database. */
export interface SessionUserRecord {
  id: string;
  name?: string | null;
  email: string;
  image?: string | null;
  role?: "CUSTOMER" | "ADMIN";
}

/** Exactly what /api/auth/session sends to the browser. */
export interface PublicSession {
  expires: string;
  user: { id: string; name: string | null; email: string; image: string | null; role: "CUSTOMER" | "ADMIN" };
}

/**
 * The session as the browser may see it: an allow-list, never the incoming
 * object. With database sessions Auth.js hands the callback the stored row —
 * including the raw session token, the value of the httpOnly cookie — and
 * whatever is returned becomes the JSON body of /api/auth/session, readable by
 * any script on the page.
 */
export function publicSession(session: { expires: Date | string }, user: SessionUserRecord): PublicSession {
  return {
    expires: session.expires instanceof Date ? session.expires.toISOString() : String(session.expires),
    user: {
      id: user.id,
      name: user.name ?? null,
      email: user.email,
      image: user.image ?? null,
      role: user.role ?? "CUSTOMER",
    },
  };
}

/**
 * Google identities are accepted only with a verified email address. Google can
 * return email_verified: false (an account registered on an address that was never
 * confirmed), and Auth.js does not check it. Accounts link by email and orders are
 * visible by email, so an unverified address must never get in.
 */
export function isVerifiedGoogleProfile(profile: { email_verified?: unknown } | null | undefined): boolean {
  return profile?.email_verified === true;
}

/**
 * The key a sign-in link's per-address limit is counted under: lower-cased, with
 * any "+tag" dropped, so victim+1@…, victim+2@… share one allowance.
 */
export function signInEmailLimitKey(email: string): string {
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at <= 0) return address;
  const local = address.slice(0, at).split("+")[0] || address.slice(0, at);
  return `${local}${address.slice(at)}`;
}

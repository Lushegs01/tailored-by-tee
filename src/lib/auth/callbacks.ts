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

const HEXTET = /^[0-9a-f]{1,4}$/;
const DOTTED_IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * The 16-bit groups written in one side of an IPv6 address's "::". A dotted IPv4
 * address may end the whole address (`last`), and counts as the final two groups.
 * Null if malformed.
 */
function ipv6Groups(part: string, last: boolean): number[] | null {
  if (part === "") return [];
  const groups: number[] = [];
  const pieces = part.split(":");
  for (const [index, piece] of pieces.entries()) {
    if (HEXTET.test(piece)) {
      groups.push(parseInt(piece, 16));
      continue;
    }
    const dotted = last && index === pieces.length - 1 ? DOTTED_IPV4.exec(piece) : null;
    const octets = dotted ? dotted.slice(1).map(Number) : [];
    if (octets.length !== 4 || octets.some((octet) => octet > 255)) return null;
    groups.push(octets[0] * 256 + octets[1], octets[2] * 256 + octets[3]);
  }
  return groups;
}

/** An IPv6 address as its eight 16-bit groups, however it is written; null if it isn't one. */
function parseIpv6(value: string): number[] | null {
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const compressed = halves.length === 2;
  const head = ipv6Groups(halves[0], !compressed);
  const tail = compressed ? ipv6Groups(halves[1], true) : [];
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  // "::" stands for at least one zero group; without it, all eight are written out.
  if (compressed ? missing < 1 : missing !== 0) return null;
  return [...head, ...Array<number>(missing).fill(0), ...tail];
}

/**
 * The key sign-in limits count a caller's address under. An IPv4 address is its
 * own key; an IPv6 address counts as its /64 network, since one connection is
 * usually handed a whole /64 and could otherwise rotate through endless addresses,
 * each with a fresh allowance (and use up the instance-wide one). IPv4-mapped IPv6
 * (the first 80 bits zero, the next 16 ones — ::ffff:1.2.3.4, ::ffff:102:304,
 * 0:0:0:0:0:ffff:1.2.3.4…) counts as the IPv4 address it carries. The rest of the
 * all-zero /64 (loopback ::1, say) is no one's network, so each of those addresses
 * counts on its own rather than all sharing one allowance. Anything unrecognised
 * is used as it is.
 */
export function signInNetworkLimitKey(address: string): string {
  const value = address.trim().toLowerCase().replace(/%.*$/, "");
  if (!value.includes(":")) return value;

  const groups = parseIpv6(value);
  if (!groups) return value;

  const network = groups.slice(0, 4);
  const host = groups.slice(4);
  if (network.some((group) => group !== 0)) {
    return `${network.map((group) => group.toString(16)).join(":")}::/64`;
  }

  if (host[0] === 0 && host[1] === 0xffff) {
    return [host[2] >> 8, host[2] & 0xff, host[3] >> 8, host[3] & 0xff].join(".");
  }
  // Written in its shortest form ("::1", "::"): the leading zero groups fold into the "::".
  while (host[0] === 0) host.shift();
  return `::${host.map((group) => group.toString(16)).join(":")}`;
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

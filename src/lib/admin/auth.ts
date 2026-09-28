import "server-only";

import { notFound, redirect, unstable_rethrow } from "next/navigation";

import { getCurrentUser, signInPath } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";

export { parseInput } from "./validation";
export type { FieldErrors, ParseInputResult } from "./validation";

/*
 * The admin area's gate. Every admin page, server action and route handler goes
 * through one of these before doing anything else.
 *
 * The role comes from the database on every request (sessions are database
 * sessions), so removing someone's admin role takes effect on their next click.
 * Pages and layouts render in parallel, so the layout's check alone is never
 * enough: each page calls requireAdminPage too.
 */

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
}

/** What every admin server action returns. Never throw to the client: return one of these. */
export type AdminActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/** The signed-in admin, or null for visitors, customers and broken sessions. */
export async function getAdminUser(): Promise<AdminUser | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return { id: user.id, email: user.email, name: user.name };
}

/**
 * For admin pages and layouts, first thing: `const admin = await requireAdminPage("/admin/orders")`.
 * Signed out → sign in, then back to `path`. Signed in without the admin role →
 * the ordinary 404, so the admin area's existence isn't advertised.
 */
export async function requireAdminPage(path: string): Promise<AdminUser> {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(path));
  if (user.role !== "admin") notFound();
  return { id: user.id, email: user.email, name: user.name };
}

export const NOT_ADMIN_MESSAGE =
  "You’re signed out, or your account no longer has admin access. Sign in again to continue.";

export const UNEXPECTED_ERROR_MESSAGE =
  "Something went wrong on our side. Refresh the page to check whether your change was saved, then try again.";

function tooManyMessage(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return `That’s a lot of changes in a short time. Please wait ${seconds} second${seconds === 1 ? "" : "s"} and try again.`;
}

export interface AdminRateLimit {
  /** Calls allowed per window, per admin. Default 120. */
  limit?: number;
  /** Default one minute. */
  windowMs?: number;
}

/**
 * Wraps an admin server action body:
 *
 *   export async function archiveProduct(input: unknown): Promise<AdminActionResult> {
 *     return withAdmin("product.archive", async (admin) => {
 *       const parsed = parseInput(schema, input);
 *       if (!parsed.ok) return parsed;
 *       …
 *       return { ok: true, data: null, message: "Product archived." };
 *     }, { limit: 30 });
 *   }
 *
 * 1. Checks the caller is an admin (otherwise { ok: false }, nothing runs).
 * 2. Rate-limits per admin and `key` (in-memory, per server instance).
 * 3. Catches unexpected errors: logs them server-side with `key` and returns a
 *    generic message. redirect(), notFound() and Next's other control-flow
 *    signals are re-thrown, so they keep working inside `run`.
 */
export async function withAdmin<T>(
  key: string,
  run: (admin: AdminUser) => Promise<AdminActionResult<T>>,
  options: AdminRateLimit = {},
): Promise<AdminActionResult<T>> {
  try {
    const admin = await getAdminUser();
    if (!admin) return { ok: false, message: NOT_ADMIN_MESSAGE };

    const limited = rateLimit(`admin:${key}:${admin.id}`, {
      limit: options.limit ?? 120,
      windowMs: options.windowMs ?? 60_000,
    });
    if (!limited.ok) return { ok: false, message: tooManyMessage(limited.retryAfterMs) };

    return await run(admin);
  } catch (error) {
    unstable_rethrow(error);
    logAdminError(key, error);
    return { ok: false, message: UNEXPECTED_ERROR_MESSAGE };
  }
}

/**
 * Wraps an admin route handler body (exports, uploads, anything that isn't a
 * server action). Answers 404 to non-admins (no hint the endpoint exists), 403
 * to cross-site writes, 429 when rate-limited and 500 with a generic message on
 * unexpected errors.
 *
 *   export async function GET(request: Request) {
 *     return withAdminRoute(request, "orders.export", async (admin) => new Response(csv, { headers }));
 *   }
 */
export async function withAdminRoute(
  request: Request,
  key: string,
  run: (admin: AdminUser) => Promise<Response>,
  options: AdminRateLimit = {},
): Promise<Response> {
  try {
    const admin = await getAdminUser();
    if (!admin) return Response.json({ error: "Not found." }, { status: 404 });

    if (!isSafeMethod(request.method) && !isSameOrigin(request)) {
      return Response.json({ error: "This request must come from the admin area." }, { status: 403 });
    }

    const limited = rateLimit(`admin:${key}:${admin.id}`, {
      limit: options.limit ?? 120,
      windowMs: options.windowMs ?? 60_000,
    });
    if (!limited.ok) {
      return Response.json(
        { error: tooManyMessage(limited.retryAfterMs) },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } },
      );
    }

    return await run(admin);
  } catch (error) {
    unstable_rethrow(error);
    logAdminError(key, error);
    return Response.json({ error: UNEXPECTED_ERROR_MESSAGE }, { status: 500 });
  }
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

/** Writes must carry an Origin (or Referer) on this host. Session cookies are SameSite=Lax too; this is belt and braces. */
function isSameOrigin(request: Request): boolean {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!host || !source) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

/** Server-side log line for an unexpected admin failure. Never sent to the browser. */
export function logAdminError(key: string, error: unknown): void {
  if (error instanceof Error) {
    const code = "code" in error ? ` (${String((error as { code?: unknown }).code)})` : "";
    console.error(`[admin] ${key} failed: ${error.name}${code}: ${error.message}`, error.stack ?? "");
  } else {
    console.error(`[admin] ${key} failed`, error);
  }
}

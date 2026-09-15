import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/auth";
import { accountsEnabled } from "@/lib/auth/config";

/*
 * The signed-in customer, for server components, server actions and route
 * handlers. Every account query is scoped by `user.id` from here — never by an
 * id the browser supplies.
 */

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: "customer" | "admin";
}

/**
 * The signed-in user, or null. Cached per request. A broken session reads as
 * signed out rather than throwing; only Next's own control-flow signals pass
 * through (e.g. "this route reads request headers", raised while prerendering),
 * so a page that reads the session is correctly left dynamic.
 *
 * Always per request — even with accounts switched off, when there is no session
 * to read — so account pages never become prerendered pages.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  await connection();
  if (!accountsEnabled) return null;
  try {
    const session = await auth();
    const user = session?.user;
    if (!user?.id || !user.email) return null;
    return {
      id: user.id,
      email: user.email.toLowerCase(),
      name: user.name ?? null,
      role: user.role === "ADMIN" ? "admin" : "customer",
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[auth] could not read the session", error instanceof Error ? error.message : error);
    return null;
  }
});

/** Control characters, DEL and backslashes — browsers read "\" as "/", so "/\evil.com" would leave the site. */
function hasUnsafeCharacter(path: string): boolean {
  for (const char of path) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127 || char === "\\") return true;
  }
  return false;
}

/**
 * A same-site path to return to after signing in. Anything else — absolute URLs,
 * protocol-relative "//host", backslash tricks — falls back to the account page,
 * so a crafted link can never bounce a customer to another site.
 */
export function safeReturnPath(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string") return fallback;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || hasUnsafeCharacter(path) || path.length > 512) {
    return fallback;
  }
  return path;
}

export function signInPath(returnTo: string): string {
  return `/account/sign-in?callbackUrl=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

const SIGN_IN_RETURN_COOKIE = "tbt_signin_return";

/**
 * Remembers where a sign-in started. Auth.js's error redirects (an expired link,
 * a cancelled Google sign-in) land on the sign-in page without the return path,
 * so the page falls back to this. Server actions only.
 */
export async function rememberSignInReturn(path: string): Promise<void> {
  (await cookies()).set(SIGN_IN_RETURN_COOKIE, safeReturnPath(path), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/account/sign-in",
    maxAge: 60 * 60,
  });
}

/** The return path remembered by rememberSignInReturn, if any (already checked to be same-site). */
export async function recalledSignInReturn(): Promise<string | undefined> {
  const value = (await cookies()).get(SIGN_IN_RETURN_COOKIE)?.value;
  return value ? safeReturnPath(value) : undefined;
}

/** The signed-in user, or a redirect to sign in (coming back to `returnTo` afterwards). */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(returnTo));
  return user;
}

/** For the admin area (phase 9): signed-in admins only; everyone else is sent to the homepage. */
export async function requireAdmin(returnTo: string): Promise<CurrentUser> {
  const user = await requireUser(returnTo);
  if (user.role !== "admin") redirect("/");
  return user;
}

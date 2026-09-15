import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/lib/db";

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

/** The signed-in user, or null. Cached per request; never throws (a broken session reads as signed out). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!isDatabaseConfigured()) return null;
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

import type { NextRequest } from "next/server";

import { handlers } from "@/auth";
import { accountsEnabled } from "@/lib/auth/config";

/*
 * Auth.js endpoints: sign-in callbacks, email-link verification, session, sign-out.
 *
 * - With accounts switched off (lib/auth/config) there is nothing to answer, so
 *   every endpoint is a plain 404 rather than Auth.js's configuration error.
 * - Starting a sign-in over HTTP (POST /api/auth/signin/…) is closed: the site's
 *   own buttons are server actions that call Auth.js in-process, so this public
 *   endpoint would only ever be a way round their validation and rate limits.
 */

const notFound = () => new Response("Not found", { status: 404 });

export function GET(request: NextRequest) {
  if (!accountsEnabled) return notFound();
  return handlers.GET(request);
}

export function POST(request: NextRequest) {
  if (!accountsEnabled) return notFound();
  const { pathname } = request.nextUrl;
  if (pathname === "/api/auth/signin" || pathname.startsWith("/api/auth/signin/")) return notFound();
  return handlers.POST(request);
}

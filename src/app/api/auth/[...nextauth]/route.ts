import type { NextRequest } from "next/server";

import { handlers } from "@/auth";
import { isClosedAuthPost } from "@/lib/auth/callbacks";
import { accountsEnabled } from "@/lib/auth/config";

/*
 * Auth.js endpoints: sign-in callbacks, email-link verification, session, sign-out.
 *
 * - With accounts switched off (lib/auth/config) there is nothing to answer, so
 *   every endpoint is a plain 404 rather than Auth.js's configuration error.
 * - Starting a sign-in over HTTP (POST /api/auth/signin/…) is closed: the site's
 *   own buttons are server actions that call Auth.js in-process, so this public
 *   endpoint would only ever be a way round their validation. (The sign-in link
 *   limits live in Auth.js's signIn callback, so they hold on every path anyway.)
 */

const notFound = () => new Response("Not found", { status: 404 });

export function GET(request: NextRequest) {
  if (!accountsEnabled) return notFound();
  return handlers.GET(request);
}

export function POST(request: NextRequest) {
  if (!accountsEnabled || isClosedAuthPost(request.nextUrl.pathname)) return notFound();
  return handlers.POST(request);
}

"use client";

import { useSession } from "next-auth/react";

/*
 * Signed-in state for client components (header, wishlist sync). Read from
 * /api/auth/session after the page loads, so storefront pages stay static and
 * cacheable — nothing personal is rendered on the server for them.
 *
 * Authorisation never relies on this: every server action and account page
 * checks the session itself (lib/auth/session).
 */

export interface AccountUser {
  id: string;
  name: string | null;
  email: string;
}

export type AccountState =
  | { status: "loading"; user: null }
  | { status: "signed-out"; user: null }
  | { status: "signed-in"; user: AccountUser };

export function useAccount(): AccountState {
  const { data, status } = useSession();
  if (status === "loading") return { status: "loading", user: null };
  const user = data?.user;
  if (status !== "authenticated" || !user?.id || !user.email) return { status: "signed-out", user: null };
  return { status: "signed-in", user: { id: user.id, name: user.name ?? null, email: user.email } };
}

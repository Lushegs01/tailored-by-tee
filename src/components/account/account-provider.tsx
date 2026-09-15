"use client";

import * as React from "react";
import { SessionProvider, getSession, useSession } from "next-auth/react";

import { AccountContext, type AccountContextValue, type AccountState } from "./use-account";

/**
 * getSession() broadcasts on next-auth's channel, which the SessionProvider in
 * this tab — and in any other open tab — answers by fetching the session again.
 */
function refreshSession() {
  void getSession().catch(() => null);
}

/**
 * The account state for the whole storefront. `enabled` comes from the server's
 * configuration (never the visitor): without it no SessionProvider is mounted,
 * so a site without accounts makes no session requests at all.
 *
 * The session is fetched once per page load, and again when something asks
 * (sign-in or sign-out in any tab, the wishlist finding the session gone) — not
 * on every tab switch, which would be a server round trip each time.
 */
export function AccountProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  if (!enabled) return children;
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <SessionBridge>{children}</SessionBridge>
    </SessionProvider>
  );
}

function SessionBridge({ children }: { children: React.ReactNode }) {
  const { data, status } = useSession();
  const id = data?.user?.id;
  const email = data?.user?.email;
  const name = data?.user?.name ?? null;

  const value = React.useMemo<AccountContextValue>(() => {
    let state: AccountState;
    if (status === "loading") state = { status: "loading", user: null };
    else if (status !== "authenticated" || !id || !email) state = { status: "signed-out", user: null };
    else state = { status: "signed-in", user: { id, name, email } };
    return { state, refresh: refreshSession };
  }, [status, id, email, name]);

  return <AccountContext value={value}>{children}</AccountContext>;
}

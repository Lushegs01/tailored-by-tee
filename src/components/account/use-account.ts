"use client";

import * as React from "react";

/*
 * Signed-in state for client components (header, wishlist sync). Read from
 * /api/auth/session after the page loads, so storefront pages stay static and
 * cacheable — nothing personal is rendered on the server for them.
 *
 * When accounts are switched off (lib/auth/config) there is no session provider
 * at all: every component sees "signed-out" and `enabled: false` from this
 * context's default, and nothing asks /api/auth/session. The hooks read the
 * context either way, so they are never conditional.
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

export interface AccountContextValue {
  /**
   * Whether accounts are switched on at all. Configuration, not a session, so it is
   * the same on the server and in the browser: safe to render from straight away.
   */
  enabled: boolean;
  state: AccountState;
  /** Reads the session again, in this tab and any other open one. Never rejects; does nothing when accounts are off. */
  refresh: () => Promise<void>;
}

const ACCOUNTS_OFF: AccountContextValue = {
  enabled: false,
  state: { status: "signed-out", user: null },
  refresh: () => Promise.resolve(),
};

export const AccountContext = React.createContext<AccountContextValue>(ACCOUNTS_OFF);

export function useAccount(): AccountState {
  return React.useContext(AccountContext).state;
}

/** False when accounts are switched off, so nothing offers to sign in. */
export function useAccountsEnabled(): boolean {
  return React.useContext(AccountContext).enabled;
}

export function useRefreshAccount(): () => Promise<void> {
  return React.useContext(AccountContext).refresh;
}

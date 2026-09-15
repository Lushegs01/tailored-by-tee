"use client";

import * as React from "react";

/*
 * Signed-in state for client components (header, wishlist sync). Read from
 * /api/auth/session after the page loads, so storefront pages stay static and
 * cacheable — nothing personal is rendered on the server for them.
 *
 * When accounts are switched off (lib/auth/config) there is no session provider
 * at all: every component sees "signed-out" from this context's default, and
 * nothing asks /api/auth/session. The hooks read the context either way, so they
 * are never conditional.
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
  state: AccountState;
  /** Reads the session again, in this tab and any other open one. Does nothing when accounts are off. */
  refresh: () => void;
}

const ACCOUNTS_OFF: AccountContextValue = { state: { status: "signed-out", user: null }, refresh: () => {} };

export const AccountContext = React.createContext<AccountContextValue>(ACCOUNTS_OFF);

export function useAccount(): AccountState {
  return React.useContext(AccountContext).state;
}

export function useRefreshAccount(): () => void {
  return React.useContext(AccountContext).refresh;
}

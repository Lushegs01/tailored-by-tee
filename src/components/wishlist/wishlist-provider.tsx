"use client";

import * as React from "react";

import { addToWishlist, removeFromWishlist, syncWishlist, type WishlistSyncResult } from "@/app/wishlist/actions";
import { useAccount, useRefreshAccount } from "@/components/account/use-account";
import { LiveRegion, useAnnouncer } from "@/components/cart/live-region";
import { createStoredValue } from "@/lib/storage";

/*
 * The wishlist: product ids, newest first, in localStorage and synced across tabs.
 *
 * Guests: the browser's copy is the only one.
 *
 * Signed in: the account holds the list. The first time this tab sees a user, a
 * guest list is merged into the account once and the merged list replaces the
 * local copy (a copy already held for that same account is refreshed instead, so
 * removals made on other devices stick). After that, each save or removal made
 * in this tab shows at once and is sent to the server in order; if the server
 * refuses one, it is undone here and announced. Each answer carries the account's
 * whole list, which replaces the local copy (with this tab's unsent changes on
 * top), so a list another tab wrote meanwhile is put right.
 *
 * The local copy remembers which account it mirrors and is cleared when that
 * account signs out, so the next person on a shared device never sees it: at once
 * from the sign-out button, and otherwise once the server confirms the session
 * has gone. A failed session request looks exactly like a sign-out, so until the
 * server agrees nothing is cleared — and nothing is wiped in other tabs: a list
 * this tab was showing stays, with any queued changes (sending waits); a list
 * found stored when the page loads signed out stays hidden meanwhile. A guest's
 * own list is never cleared. Authorisation never depends on any of this: the
 * server actions read the user from the session.
 */

export interface WishlistContextValue {
  /** Newest first. Empty on the server and during hydration. */
  productIds: string[];
  count: number;
  has: (productId: string) => boolean;
  toggle: (productId: string) => void;
  add: (productId: string) => void;
  remove: (productId: string) => void;
}

export interface WishlistStatus {
  /**
   * True while the list may be about to change wholesale: the account is still
   * being checked, or a signed-in list hasn't been fetched in this tab yet. Views
   * of the list itself wait for this; a count or a heart doesn't need to.
   */
  restoring: boolean;
  /** Drops ids the catalogue no longer lists — quietly, and on this device only. */
  forget: (productIds: readonly string[]) => void;
  /**
   * For the sign-out button: forgets the account's list on this device straight
   * away, and anything queued for it. If the sign-out itself failed, the account's
   * list comes back on the next page load.
   */
  forgetAccount: () => void;
}

const STORAGE_KEY = "tbt.wishlist.v1";
/** The account the stored list mirrors; null for a guest's list. */
const OWNER_STORAGE_KEY = "tbt.wishlist.owner.v1";
const MAX_WISHLIST_ITEMS = 100;
const MAX_ID_LENGTH = 64;
/** A failed first sync (or sign-out check) is retried after these pauses, then left for later. */
const SYNC_RETRY_DELAYS_MS = [2_000, 8_000, 30_000];

function isProductId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/** Keeps only well-formed, unique ids from untrusted storage. */
function sanitizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isProductId))].slice(0, MAX_WISHLIST_ITEMS);
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

const wishlistStore = createStoredValue<string[]>(STORAGE_KEY, { fallback: [], parse: sanitizeIds });
const ownerStore = createStoredValue<string | null>(OWNER_STORAGE_KEY, {
  fallback: null,
  parse: (value) => (typeof value === "string" && value.length > 0 && value.length <= 128 ? value : null),
});

/**
 * The account whose list this tab keeps while a sign-out it noticed is being
 * confirmed with the server; null otherwise. This tab's own bookkeeping, so it
 * lives in memory rather than storage — but outside React state, like the stores
 * above, since the account-change handling sets it.
 */
const heldAccount = (() => {
  let value: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    getServer: () => null,
    set(next: string | null) {
      if (next === value) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
})();

/** One product's change, made in this tab, that the server hasn't confirmed yet. */
interface PendingChange {
  /** What this tab last asked for. */
  saved: boolean;
  /** Identifies that request; every change gets a higher number. */
  seq: number;
  /** The request currently with the server, if any. */
  sentSeq: number | null;
  /** Where to go back to if the server refuses: the state it last confirmed. */
  baseline: { saved: boolean; index: number };
}

/**
 * "unknown" until the account state is known, and while a sign-out is being
 * confirmed (changes are queued, not sent); "local" for guests (nothing is
 * sent); "account" once signed in (changes are mirrored to the server).
 */
type SyncMode = "unknown" | "local" | "account";

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function sendChange(saved: boolean, productId: string): Promise<WishlistSyncResult> {
  try {
    return await (saved ? addToWishlist(productId) : removeFromWishlist(productId));
  } catch {
    return { ok: false, reason: "error" };
  }
}

async function requestSync(localIds: string[]): Promise<WishlistSyncResult> {
  try {
    return await syncWishlist(localIds);
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** The server's list with this tab's unconfirmed changes applied on top, newest first. */
function rebase(serverIds: readonly string[], pending: ReadonlyMap<string, PendingChange>): string[] {
  const changes = [...pending].sort(([, a], [, b]) => b.seq - a.seq);
  const removed = new Set(changes.filter(([, change]) => !change.saved).map(([id]) => id));
  const added = changes.filter(([id, change]) => change.saved && !serverIds.includes(id)).map(([id]) => id);
  return sanitizeIds([...added, ...serverIds.filter((id) => !removed.has(id))]);
}

/** Replaces the local copy with the server's list plus this tab's unconfirmed changes (only if that differs). */
function writeRebased(serverIds: readonly string[], pending: ReadonlyMap<string, PendingChange>) {
  const next = rebase(serverIds, pending);
  wishlistStore.set((current) => (sameIds(current, next) ? current : next));
}

/** Puts one product back the way the server last had it, at its old position where possible. */
function restore(productId: string, baseline: PendingChange["baseline"]) {
  wishlistStore.set((current) => {
    if (current.includes(productId) === baseline.saved) return current;
    if (!baseline.saved) return current.filter((id) => id !== productId);
    const next = [...current];
    next.splice(Math.min(baseline.index, next.length), 0, productId);
    return next.slice(0, MAX_WISHLIST_ITEMS);
  });
}

/** Undoes every unconfirmed change, lowest position first so re-inserted pieces land where they were. */
function restoreAll(pending: Map<string, PendingChange>) {
  const changes = [...pending].sort(([, a], [, b]) => a.baseline.index - b.baseline.index);
  pending.clear();
  for (const [productId, change] of changes) restore(productId, change.baseline);
}

function nextUnsent(pending: ReadonlyMap<string, PendingChange>): [string, PendingChange] | null {
  for (const entry of pending) {
    if (entry[1].sentSeq !== entry[1].seq) return entry;
  }
  return null;
}

const WishlistContext = React.createContext<WishlistContextValue | null>(null);
const WishlistStatusContext = React.createContext<WishlistStatus | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const productIds = React.useSyncExternalStore(
    wishlistStore.subscribe,
    wishlistStore.get,
    wishlistStore.getServer,
  );
  const owner = React.useSyncExternalStore(ownerStore.subscribe, ownerStore.get, ownerStore.getServer);
  const account = useAccount();
  const refreshAccount = useRefreshAccount();
  const userId = account.status === "signed-in" ? account.user.id : null;
  const { message, announce } = useAnnouncer();
  /** The user whose first sync in this tab has finished, successfully or not. */
  const [settledUserId, setSettledUserId] = React.useState<string | null>(null);
  const heldUserId = React.useSyncExternalStore(heldAccount.subscribe, heldAccount.get, heldAccount.getServer);

  // Sync bookkeeping drives requests, not rendering, so it lives in refs.
  const modeRef = React.useRef<SyncMode>("unknown");
  const pendingRef = React.useRef(new Map<string, PendingChange>());
  const seqRef = React.useRef(0);
  /** Bumped whenever the account changes, so answers meant for the previous one are ignored. */
  const generationRef = React.useRef(0);
  const flushingRef = React.useRef(false);
  const syncingRef = React.useRef(false);
  /** The user this tab has synced, or is syncing, with. */
  const syncedUserRef = React.useRef<string | null>(null);
  /** Set while the session is being re-checked, so a burst of refusals asks only once. */
  const refreshingRef = React.useRef(false);
  /** Set while a sign-out this tab noticed is being confirmed with the server. */
  const confirmingRef = React.useRef(false);

  const refreshSession = React.useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    // The server no longer sees a session: have the account state read it again, so it
    // catches up. If the session really has ended, the sign-out handling below clears this list.
    void refreshAccount().finally(() => {
      refreshingRef.current = false;
    });
  }, [refreshAccount]);

  /** Sends this tab's unconfirmed changes to the server, one at a time and in order. */
  const flush = React.useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      while (modeRef.current === "account" && !syncingRef.current) {
        const next = nextUnsent(pendingRef.current);
        if (!next) break;

        const [productId, change] = next;
        const { saved, seq } = change;
        const sentGeneration = generationRef.current;
        change.sentSeq = seq;
        const result = await sendChange(saved, productId);
        // The account changed meanwhile: that list, and its changes, are gone.
        if (sentGeneration !== generationRef.current) continue;

        const latest = pendingRef.current.get(productId);
        if (result.ok) {
          if (latest?.seq === seq) pendingRef.current.delete(productId);
          // A newer change is waiting; if it fails, this is the state to return to.
          else if (latest) latest.baseline = { saved, index: 0 };
          // The answer is the account's whole list: it also puts right a copy another tab
          // replaced meanwhile (its first sync may have read the list before this change).
          writeRebased(result.productIds, pendingRef.current);
        } else if (result.reason === "signed-out") {
          // Without a session nothing queued can be saved: undo it all rather than leave
          // it showing unsaved, and have the account state re-checked.
          const several = pendingRef.current.size > 1;
          restoreAll(pendingRef.current);
          announce(
            several
              ? "We couldn’t update your wishlist. Please try again."
              : saved
                ? "We couldn’t save that to your wishlist. Please try again."
                : "We couldn’t remove that from your wishlist. Please try again.",
          );
          refreshSession();
          break;
        } else if (latest?.seq === seq) {
          pendingRef.current.delete(productId);
          restore(productId, latest.baseline);
          announce(
            saved
              ? "We couldn’t save that to your wishlist. Please try again."
              : "We couldn’t remove that from your wishlist. Please try again.",
          );
        }
        // Otherwise a newer change for this piece is waiting, and its answer decides.
      }
    } finally {
      flushingRef.current = false;
    }
  }, [announce, refreshSession]);

  /** Queues a change made in this tab for the account (not for guests). */
  const record = React.useCallback(
    (productId: string, saved: boolean, index: number) => {
      if (modeRef.current === "local") return;
      seqRef.current += 1;
      const existing = pendingRef.current.get(productId);
      if (existing) {
        existing.saved = saved;
        existing.seq = seqRef.current;
      } else {
        pendingRef.current.set(productId, {
          saved,
          seq: seqRef.current,
          sentSeq: null,
          baseline: { saved: !saved, index },
        });
      }
      void flush();
    },
    [flush],
  );

  /** Fetches the account's list (merging a guest list into it first), retrying a few times on failure. */
  const runSync = React.useCallback(
    async (syncUserId: string) => {
      const startedGeneration = generationRef.current;
      for (let attempt = 0; ; attempt += 1) {
        // Only a guest's list is merged; a copy already held for this account is refreshed instead.
        const localIds = ownerStore.get() === null ? wishlistStore.get() : [];
        syncingRef.current = true;
        const result = await requestSync(localIds);
        if (startedGeneration !== generationRef.current) return;
        syncingRef.current = false;
        setSettledUserId(syncUserId);

        if (result.ok) {
          writeRebased(result.productIds, pendingRef.current);
          ownerStore.set(syncUserId);
          void flush();
          return;
        }
        // The server doesn't see the session: re-check it. A real sign-out moves this
        // tab to a new generation, which ends this loop; a passing fault is retried.
        if (result.reason === "signed-out") refreshSession();
        // Keep what's on screen, and let this tab's own changes through meanwhile.
        void flush();
        if (attempt >= SYNC_RETRY_DELAYS_MS.length) return;
        await wait(SYNC_RETRY_DELAYS_MS[attempt]);
        if (startedGeneration !== generationRef.current) return;
      }
    },
    [flush, refreshSession],
  );

  /** The account has left this tab: drop its list and anything queued for it. A guest's own list stays. */
  const clearAccountList = React.useCallback(() => {
    const hadAccount = syncedUserRef.current !== null;
    generationRef.current += 1;
    modeRef.current = "local";
    syncedUserRef.current = null;
    syncingRef.current = false;
    confirmingRef.current = false;
    pendingRef.current.clear();
    heldAccount.set(null);
    if (hadAccount || ownerStore.get() !== null) {
      wishlistStore.set([]);
      ownerStore.set(null);
    }
  }, []);

  /**
   * The session vanished while this tab was signed in. next-auth reads a failed
   * session request as "nobody", so that alone proves nothing: keep the list and
   * everything queued, pause sending, and ask the server. Only its "signed out"
   * clears the list; if it still sees the account, carry on as before.
   */
  const confirmSignOut = React.useCallback(async () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    modeRef.current = "unknown";
    const startedGeneration = generationRef.current;
    // Another account signed in, the sign-out button was used, or the same account came back.
    const superseded = () => startedGeneration !== generationRef.current || !confirmingRef.current;

    for (let attempt = 0; ; attempt += 1) {
      const result = await requestSync([]);
      if (superseded()) return;

      if (result.ok) {
        // Still signed in: it was the session request that failed.
        confirmingRef.current = false;
        modeRef.current = "account";
        writeRebased(result.productIds, pendingRef.current);
        void refreshAccount();
        void flush();
        return;
      }
      if (result.reason === "signed-out") {
        clearAccountList();
        return;
      }
      if (attempt >= SYNC_RETRY_DELAYS_MS.length) {
        // Still can't tell. Keep everything; the check runs again when the connection or the tab returns.
        confirmingRef.current = false;
        return;
      }
      await wait(SYNC_RETRY_DELAYS_MS[attempt]);
      if (superseded()) return;
    }
  }, [clearAccountList, flush, refreshAccount]);

  /**
   * The page loaded signed out, but the list stored here mirrors an account —
   * usually because that account signed out while the page was closed, but a
   * failed session request looks the same, and clearing on that alone would empty
   * the list in the account's other open tabs. The list stays hidden (restoring)
   * while the server is asked. This tab has sent nothing for it, so clearing loses
   * nothing: the account keeps its own copy.
   */
  const confirmStoredOwner = React.useCallback(async () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    const startedGeneration = generationRef.current;
    // Someone signed in (which syncs or replaces the list), or the list was cleared meanwhile.
    const superseded = () => startedGeneration !== generationRef.current || !confirmingRef.current;

    for (let attempt = 0; ; attempt += 1) {
      const result = await requestSync([]);
      if (superseded()) return;

      if (result.ok) {
        // The server still sees a session, so this page's session request failed: read it
        // again. Signing in here then syncs the list (or replaces another account's).
        confirmingRef.current = false;
        void refreshAccount();
        return;
      }
      if (result.reason === "signed-out" || attempt >= SYNC_RETRY_DELAYS_MS.length) {
        // Signed out — or still unknown after retrying, when privacy wins: the list is safe on the server.
        clearAccountList();
        return;
      }
      await wait(SYNC_RETRY_DELAYS_MS[attempt]);
      if (superseded()) return;
    }
  }, [clearAccountList, refreshAccount]);

  const onSignedOut = React.useEffectEvent(() => {
    const signedIn = syncedUserRef.current;
    if (signedIn !== null) {
      heldAccount.set(signedIn);
      void confirmSignOut();
      return;
    }
    if (ownerStore.get() !== null) {
      void confirmStoredOwner();
      return;
    }
    // A guest (or accounts are off): nothing here belongs to an account.
    clearAccountList();
  });

  const onSignedIn = React.useEffectEvent((signedInId: string) => {
    heldAccount.set(null);
    if (syncedUserRef.current === signedInId) {
      // The same account, back after a session check: carry on where this tab left off.
      confirmingRef.current = false;
      if (modeRef.current !== "account") {
        modeRef.current = "account";
        void flush();
      }
      return;
    }

    const storedOwner = ownerStore.get();
    const switched = syncedUserRef.current !== null || (storedOwner !== null && storedOwner !== signedInId);
    syncedUserRef.current = signedInId;
    generationRef.current += 1;
    modeRef.current = "account";
    confirmingRef.current = false;
    if (switched) {
      // Another account's list: never merge it into this one.
      pendingRef.current.clear();
      wishlistStore.set([]);
      ownerStore.set(null);
    }
    void runSync(signedInId);
  });

  React.useEffect(() => {
    if (account.status === "signed-out") onSignedOut();
    else if (userId !== null) onSignedIn(userId);
  }, [account.status, userId]);

  // A sign-out that couldn't be confirmed either way is checked again when the connection or the tab comes back.
  React.useEffect(() => {
    if (heldUserId === null) return;
    const recheck = () => {
      if (document.visibilityState === "visible") void confirmSignOut();
    };
    window.addEventListener("online", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("online", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [heldUserId, confirmSignOut]);

  const add = React.useCallback(
    (productId: string) => {
      const current = wishlistStore.get();
      if (!isProductId(productId) || current.includes(productId)) return;
      // At capacity the oldest save makes way, so the newest action always succeeds.
      wishlistStore.set([productId, ...current].slice(0, MAX_WISHLIST_ITEMS));
      record(productId, true, 0);
      announce("Saved to your wishlist");
    },
    [announce, record],
  );

  const remove = React.useCallback(
    (productId: string) => {
      const current = wishlistStore.get();
      const index = current.indexOf(productId);
      if (index === -1) return;
      wishlistStore.set(current.filter((id) => id !== productId));
      record(productId, false, index);
      announce("Removed from your wishlist");
    },
    [announce, record],
  );

  const toggle = React.useCallback(
    (productId: string) => (wishlistStore.get().includes(productId) ? remove(productId) : add(productId)),
    [add, remove],
  );

  const forget = React.useCallback((ids: readonly string[]) => {
    const drop = new Set(ids);
    wishlistStore.set((current) =>
      current.some((id) => drop.has(id)) ? current.filter((id) => !drop.has(id)) : current,
    );
  }, []);

  const value = React.useMemo<WishlistContextValue>(() => {
    const saved = new Set(productIds);
    return {
      productIds,
      count: productIds.length,
      has: (productId) => saved.has(productId),
      toggle,
      add,
      remove,
    };
  }, [productIds, toggle, add, remove]);

  /** The account the list on screen belongs to: the signed-in one, or one whose sign-out is unconfirmed. */
  const listUserId = userId ?? heldUserId;
  const restoring =
    account.status === "loading" ||
    // Stored for an account that isn't the one here: about to be cleared.
    (owner !== null && owner !== listUserId) ||
    // Signed in, but this browser doesn't hold the account's list yet.
    (userId !== null && owner !== userId && settledUserId !== userId);

  const status = React.useMemo<WishlistStatus>(
    () => ({ restoring, forget, forgetAccount: clearAccountList }),
    [restoring, forget, clearAccountList],
  );

  return (
    <WishlistContext value={value}>
      <WishlistStatusContext value={status}>
        {children}
        <LiveRegion message={message} />
      </WishlistStatusContext>
    </WishlistContext>
  );
}

export function useWishlist() {
  const context = React.useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used within <WishlistProvider>");
  return context;
}

/** Sync state for views of the list itself (the wishlist page), and the sign-out button. */
export function useWishlistStatus() {
  const context = React.useContext(WishlistStatusContext);
  if (!context) throw new Error("useWishlistStatus must be used within <WishlistProvider>");
  return context;
}

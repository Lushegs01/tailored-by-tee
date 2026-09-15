"use client";

import * as React from "react";
import { getSession } from "next-auth/react";

import { addToWishlist, removeFromWishlist, syncWishlist, type WishlistSyncResult } from "@/app/wishlist/actions";
import { useAccount } from "@/components/account/use-account";
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
 * refuses one, it is undone here and announced.
 *
 * The local copy remembers which account it mirrors and is cleared when that
 * account signs out — even if the sign-out happened while this page was closed —
 * so the next person on a shared device never sees it. A guest's own list is
 * never cleared. Authorisation never depends on any of this: the server actions
 * read the user from the session.
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
}

const STORAGE_KEY = "tbt.wishlist.v1";
/** The account the stored list mirrors; null for a guest's list. */
const OWNER_STORAGE_KEY = "tbt.wishlist.owner.v1";
const MAX_WISHLIST_ITEMS = 100;
const MAX_ID_LENGTH = 64;
/** A failed first sync is retried after these pauses, then left until the next visit. */
const SYNC_RETRY_DELAYS_MS = [2_000, 8_000, 30_000];

function isProductId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/** Keeps only well-formed, unique ids from untrusted storage. */
function sanitizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isProductId))].slice(0, MAX_WISHLIST_ITEMS);
}

const wishlistStore = createStoredValue<string[]>(STORAGE_KEY, { fallback: [], parse: sanitizeIds });
const ownerStore = createStoredValue<string | null>(OWNER_STORAGE_KEY, {
  fallback: null,
  parse: (value) => (typeof value === "string" && value.length > 0 && value.length <= 128 ? value : null),
});

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
 * "unknown" until the account state is known; "local" for guests (nothing is
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
  const userId = account.status === "signed-in" ? account.user.id : null;
  const { message, announce } = useAnnouncer();
  /** The user whose first sync in this tab has finished, successfully or not. */
  const [settledUserId, setSettledUserId] = React.useState<string | null>(null);

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
  /** Set once the server has said the session is gone, until the account state catches up. */
  const nudgedRef = React.useRef(false);

  const refreshSession = React.useCallback(() => {
    if (nudgedRef.current) return;
    nudgedRef.current = true;
    // The server says this session has ended: have the session provider fetch it
    // again, so the account state — and with it this list — catches up.
    void getSession().catch(() => null);
  }, []);

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
        } else if (result.reason === "signed-out") {
          if (latest?.seq === seq) latest.sentSeq = null;
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
          wishlistStore.set(rebase(result.productIds, pendingRef.current));
          ownerStore.set(syncUserId);
          void flush();
          return;
        }
        if (result.reason === "signed-out") {
          refreshSession();
          return;
        }
        // Keep what's on screen, and let this tab's own changes through meanwhile.
        void flush();
        if (attempt >= SYNC_RETRY_DELAYS_MS.length) return;
        await wait(SYNC_RETRY_DELAYS_MS[attempt]);
        if (startedGeneration !== generationRef.current) return;
      }
    },
    [flush, refreshSession],
  );

  const onSignedOut = React.useEffectEvent(() => {
    const wasSignedIn = syncedUserRef.current !== null;
    generationRef.current += 1;
    modeRef.current = "local";
    syncedUserRef.current = null;
    syncingRef.current = false;
    nudgedRef.current = false;
    pendingRef.current.clear();
    // A list mirrored from an account leaves with the account; a guest's own list stays.
    if (wasSignedIn || ownerStore.get() !== null) {
      wishlistStore.set([]);
      ownerStore.set(null);
    }
  });

  const onSignedIn = React.useEffectEvent((signedInId: string) => {
    nudgedRef.current = false;
    if (syncedUserRef.current === signedInId) return;

    const storedOwner = ownerStore.get();
    const switched = syncedUserRef.current !== null || (storedOwner !== null && storedOwner !== signedInId);
    syncedUserRef.current = signedInId;
    generationRef.current += 1;
    modeRef.current = "account";
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

  const restoring =
    account.status === "loading" ||
    // Stored for an account that isn't the one signed in here: about to be cleared.
    (owner !== null && owner !== userId) ||
    // Signed in, but this browser doesn't hold the account's list yet.
    (userId !== null && owner !== userId && settledUserId !== userId);

  const status = React.useMemo<WishlistStatus>(() => ({ restoring, forget }), [restoring, forget]);

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

/** Sync state for views of the list itself (the wishlist page). */
export function useWishlistStatus() {
  const context = React.useContext(WishlistStatusContext);
  if (!context) throw new Error("useWishlistStatus must be used within <WishlistProvider>");
  return context;
}

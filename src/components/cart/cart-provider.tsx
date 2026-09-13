"use client";

import * as React from "react";

import {
  EMPTY_QUOTE,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  clampQuantity,
  countItems,
  describeLine,
  linesKey,
  mergeIssues,
  reconcileLines,
  sanitizeLines,
} from "@/components/cart/cart-lines";
import { LiveRegion, useAnnouncer } from "@/components/cart/live-region";
import type { CartIssue, CartLineInput, CartQuote } from "@/lib/catalog/types";
import { createStoredValue } from "@/lib/storage";

/*
 * The browser holds only { variantId, quantity } pairs. Names, images, prices, stock
 * and totals always come from POST /api/cart/quote, so nothing stored locally can
 * change what a customer pays.
 */

export interface AddItemOptions {
  /** Open the cart drawer after adding. Defaults to true. */
  openDrawer?: boolean;
  /**
   * Readable description, e.g. "Structured Overshirt, Clay, M", announced straight
   * away. Without it the announcement waits for the quote to name the piece.
   */
  label?: string;
}

export interface CartContextValue {
  /** Client-held state is only variant ids + quantities. Prices come from `quote`. */
  lines: CartLineInput[];
  itemCount: number;
  /**
   * Server-priced snapshot of `lines` (null until the first quote resolves). While
   * `status` is "loading" this is the previous snapshot. An empty bag gets a zero quote.
   */
  quote: CartQuote | null;
  status: "idle" | "loading" | "error";
  isOpen: boolean;
  open: () => void;
  close: () => void;
  setOpen: (open: boolean) => void;
  addItem: (variantId: string, quantity?: number, options?: AddItemOptions) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clear: () => void;
  /** Corrections from the server (sold out, quantity reduced). Cleared when the drawer closes. */
  notices?: CartIssue[];
  dismissNotices?: () => void;
  /** Requests a fresh quote, e.g. after a network failure. */
  refresh?: () => void;
}

const STORAGE_KEY = "tbt.cart.v1";
const QUOTE_DEBOUNCE_MS = 150;

const cartStore = createStoredValue<CartLineInput[]>(STORAGE_KEY, {
  fallback: [],
  parse: sanitizeLines,
});

async function requestQuote(lines: CartLineInput[], signal: AbortSignal): Promise<CartQuote> {
  const response = await fetch("/api/cart/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines }),
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`Cart quote failed with ${response.status}`);

  const quote = (await response.json()) as CartQuote;
  if (!Array.isArray(quote?.lines) || !Array.isArray(quote.issues)) throw new Error("Malformed cart quote");
  return quote;
}

const CartContext = React.createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  // Server and hydration render an empty bag; stored lines arrive right after.
  const lines = React.useSyncExternalStore(cartStore.subscribe, cartStore.get, cartStore.getServer);
  const [isOpen, setIsOpen] = React.useState(false);
  const [resolved, setResolved] = React.useState<{ key: string; quote: CartQuote } | null>(null);
  const [failedKey, setFailedKey] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [notices, setNotices] = React.useState<CartIssue[]>([]);
  const { message, announce } = useAnnouncer();

  /** Latest quote, for naming pieces in announcements from event handlers. */
  const latestQuote = React.useRef<CartQuote | null>(null);
  /** Adds still waiting for a quote to tell us what the piece is called. */
  const pendingAdds = React.useRef<Set<string>>(new Set());

  const key = linesKey(lines);
  const hasLines = lines.length > 0;
  const status: CartContextValue["status"] = !hasLines
    ? "idle"
    : failedKey === key
      ? "error"
      : resolved?.key === key
        ? "idle"
        : "loading";
  const quote = hasLines ? (resolved?.quote ?? null) : EMPTY_QUOTE;

  const describe = (variantId: string) => {
    const line = latestQuote.current?.lines.find((item) => item.variantId === variantId);
    return line ? describeLine(line) : null;
  };

  const onQuote = React.useEffectEvent((sent: CartLineInput[], next: CartQuote) => {
    const sentKey = linesKey(sent);
    latestQuote.current = next;
    setResolved({ key: sentKey, quote: next });
    setFailedKey(null);

    const messages: string[] = [];
    for (const variantId of pendingAdds.current) {
      const line = next.lines.find((item) => item.variantId === variantId);
      if (line) messages.push(`Added ${describeLine(line)} to your bag.`);
      if (line || next.issues.some((issue) => issue.variantId === variantId)) {
        pendingAdds.current.delete(variantId);
      }
    }

    if (next.issues.length > 0) {
      // The server is authoritative: adopt its quantities unless the bag moved on meanwhile.
      cartStore.set((current) => (linesKey(current) === sentKey ? reconcileLines(current, next) : current));
      setNotices((current) => mergeIssues(current, next.issues));
      messages.push(...next.issues.map((issue) => issue.message));
    }

    if (messages.length > 0) announce(messages.join(" "));
  });

  const onQuoteError = React.useEffectEvent((sent: CartLineInput[]) => {
    setFailedKey(linesKey(sent));
    announce("We could not update your bag just now.");
  });

  React.useEffect(() => {
    if (lines.length === 0) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      requestQuote(lines, controller.signal)
        .then((next) => {
          if (!controller.signal.aborted) onQuote(lines, next);
        })
        .catch(() => {
          if (!controller.signal.aborted) onQuoteError(lines);
        });
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lines, attempt]);

  const dropNotice = React.useCallback((variantId: string) => {
    setNotices((current) =>
      current.some((notice) => notice.variantId === variantId)
        ? current.filter((notice) => notice.variantId !== variantId)
        : current,
    );
  }, []);

  const setOpen = React.useCallback(
    (open: boolean) => {
      setIsOpen(open);
      // Corrections have been seen once the drawer closes; don't repeat them.
      if (isOpen && !open) setNotices([]);
    },
    [isOpen],
  );

  const removeItem = React.useCallback(
    (variantId: string) => {
      const current = cartStore.get();
      if (!current.some((line) => line.variantId === variantId)) return;

      cartStore.set(current.filter((line) => line.variantId !== variantId));
      pendingAdds.current.delete(variantId);
      dropNotice(variantId);

      const label = describe(variantId);
      announce(label ? `Removed ${label} from your bag.` : "Removed from your bag.");
    },
    // `describe` only reads a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [announce, dropNotice],
  );

  const addItem = React.useCallback(
    (variantId: string, quantity = 1, options?: AddItemOptions) => {
      const current = cartStore.get();
      const existing = current.find((line) => line.variantId === variantId);
      if (options?.openDrawer !== false) setIsOpen(true);

      if (!existing && current.length >= MAX_CART_LINES) {
        announce(`Your bag holds up to ${MAX_CART_LINES} different pieces.`);
        return;
      }

      const requested = (existing?.quantity ?? 0) + clampQuantity(quantity);
      const nextQuantity = Math.min(requested, MAX_LINE_QUANTITY);
      const limitNote =
        requested > MAX_LINE_QUANTITY ? `You can add up to ${MAX_LINE_QUANTITY} of each piece.` : "";

      if (existing?.quantity === nextQuantity) {
        announce(limitNote);
        return;
      }

      cartStore.set(
        existing
          ? current.map((line) => (line.variantId === variantId ? { ...line, quantity: nextQuantity } : line))
          : [{ variantId, quantity: nextQuantity }, ...current],
      );
      dropNotice(variantId);

      const label = options?.label ?? describe(variantId);
      if (label) {
        announce([`Added ${label} to your bag.`, limitNote].filter(Boolean).join(" "));
      } else {
        pendingAdds.current.add(variantId);
        if (limitNote) announce(limitNote);
      }
    },
    // `describe` only reads a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [announce, dropNotice],
  );

  const updateQuantity = React.useCallback(
    (variantId: string, quantity: number) => {
      if (quantity < 1) {
        removeItem(variantId);
        return;
      }

      const nextQuantity = clampQuantity(quantity);
      const current = cartStore.get();
      const line = current.find((item) => item.variantId === variantId);
      if (!line || line.quantity === nextQuantity) return;

      cartStore.set(
        current.map((item) => (item.variantId === variantId ? { ...item, quantity: nextQuantity } : item)),
      );
      dropNotice(variantId);

      const label = describe(variantId);
      announce(
        label ? `Quantity of ${label} changed to ${nextQuantity}.` : `Quantity changed to ${nextQuantity}.`,
      );
    },
    // `describe` only reads a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [announce, dropNotice, removeItem],
  );

  const clear = React.useCallback(() => {
    cartStore.set([]);
    pendingAdds.current.clear();
    setNotices([]);
  }, []);

  const refresh = React.useCallback(() => {
    setFailedKey(null);
    setAttempt((value) => value + 1);
  }, []);

  const dismissNotices = React.useCallback(() => setNotices([]), []);

  const value = React.useMemo<CartContextValue>(
    () => ({
      lines,
      itemCount: countItems(lines),
      quote,
      status,
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      setOpen,
      addItem,
      updateQuantity,
      removeItem,
      clear,
      notices,
      dismissNotices,
      refresh,
    }),
    [lines, quote, status, isOpen, setOpen, addItem, updateQuantity, removeItem, clear, notices, dismissNotices, refresh],
  );

  return (
    <CartContext value={value}>
      {children}
      <LiveRegion message={message} />
    </CartContext>
  );
}

export function useCart() {
  const context = React.useContext(CartContext);
  if (!context) throw new Error("useCart must be used within <CartProvider>");
  return context;
}

import type { InventoryReason, ProductStatus } from "@/generated/prisma/enums";
import { stockStatus } from "@/lib/catalog/inventory";

import type { ListParams, ListParamsAllowed, RawSearchParams, SortDir } from "./pagination";
import { parseListParams } from "./pagination";
import { stockDisplay } from "./status";

/*
 * The stock rules of the admin area, pure (no server or browser APIs), so the
 * inventory service, its server actions, the forms' live previews and the tests
 * all agree:
 *
 * - stock state (in stock / low / sold out), by the storefront's own rule;
 * - the reasons a person can give for changing stock, and which way each goes;
 * - what a change or a count would do before it is sent (the database decides for real);
 * - the words for the history list and the success messages;
 * - the inventory list's URL parameters, shared by the page and its CSV export.
 */

/* ── Stock state ─────────────────────────────────────────────────────────── */

export const STOCK_STATES = ["in_stock", "low_stock", "out_of_stock"] as const;

export type StockState = (typeof STOCK_STATES)[number];

export interface StockLevel {
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
}

/**
 * The storefront's rule (lib/catalog/inventory): nothing available to sell is
 * out of stock; available at or below the low-stock level is low; otherwise in stock.
 */
export function stockState(level: StockLevel): StockState {
  return stockStatus(level);
}

/** Filter options in the admin's words, from the shared vocabulary in lib/admin/status. */
export const STOCK_STATE_OPTIONS: readonly { value: StockState; label: string }[] = [
  { value: "out_of_stock", label: stockDisplay({ onHand: 0, reserved: 0, lowStockThreshold: 0 }).label },
  { value: "low_stock", label: stockDisplay({ onHand: 1, reserved: 0, lowStockThreshold: 1 }).label },
  { value: "in_stock", label: stockDisplay({ onHand: 2, reserved: 0, lowStockThreshold: 1 }).label },
];

/* ── Limits ──────────────────────────────────────────────────────────────── */

/** Largest single adjustment, in pieces. Anything bigger is a typo. */
export const MAX_STOCK_CHANGE = 100_000;

/** Largest count a stocktake can record. */
export const MAX_STOCK_COUNT = 1_000_000;

/** Largest low-stock level. */
export const MAX_LOW_STOCK_THRESHOLD = 10_000;

/** Longest note on a stock change. */
export const MAX_STOCK_NOTE = 500;

/* ── Reading numbers typed by a person ───────────────────────────────────── */

/**
 * A whole number of pieces typed into a field: "12", " 1,200 ". Null for
 * anything else (empty, negative, decimals, "1e3", misplaced commas). The same
 * shapes the server's zInt accepts, for the forms' live previews.
 */
export function parseWholeNumber(text: string): number | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!/^(\d+|\d{1,3}(,\d{3})+)$/.test(trimmed)) return null;
  const value = Number(trimmed.replaceAll(",", ""));
  return Number.isSafeInteger(value) ? value : null;
}

/* ── Reasons ─────────────────────────────────────────────────────────────── */

/** Reasons an adjustment made through the admin service can carry (checkout reasons are recorded by the order code). */
export const ADJUST_REASONS = ["INITIAL", "RESTOCK", "CORRECTION", "DAMAGE", "ORDER_RETURNED"] as const;

export type AdjustReason = (typeof ADJUST_REASONS)[number];

export function isAdjustReason(value: unknown): value is AdjustReason {
  return typeof value === "string" && (ADJUST_REASONS as readonly string[]).includes(value);
}

/** The reasons offered in the Adjust stock form ("INITIAL" belongs to creating a variant). */
export const MANUAL_ADJUST_REASONS = ["RESTOCK", "CORRECTION", "DAMAGE", "ORDER_RETURNED"] as const;

export type ManualAdjustReason = (typeof MANUAL_ADJUST_REASONS)[number];

export function isManualAdjustReason(value: unknown): value is ManualAdjustReason {
  return typeof value === "string" && (MANUAL_ADJUST_REASONS as readonly string[]).includes(value);
}

export const STOCK_DIRECTIONS = ["add", "remove"] as const;

export type StockDirection = (typeof STOCK_DIRECTIONS)[number];

export interface AdjustReasonOption {
  value: ManualAdjustReason;
  label: string;
  /** Which way the reason moves stock; "either" lets the person choose. */
  direction: StockDirection | "either";
  hint: string;
}

export const ADJUST_REASON_OPTIONS: readonly AdjustReasonOption[] = [
  {
    value: "RESTOCK",
    label: "New stock arrived",
    direction: "add",
    hint: "Pieces delivered by the workshop or a supplier.",
  },
  {
    value: "ORDER_RETURNED",
    label: "Returned by a customer",
    direction: "add",
    hint: "A returned piece in good condition, ready to sell again.",
  },
  {
    value: "DAMAGE",
    label: "Damaged or lost",
    direction: "remove",
    hint: "Pieces that can no longer be sold.",
  },
  {
    value: "CORRECTION",
    label: "Correction",
    direction: "either",
    hint: "Fixing a figure that was wrong. To record a full count, use “Record a count” instead.",
  },
];

const REASON_LABELS: Record<InventoryReason, string> = {
  INITIAL: "Opening stock",
  RESTOCK: "New stock arrived",
  CORRECTION: "Correction",
  DAMAGE: "Damaged or lost",
  ORDER_RESERVED: "Held for a checkout",
  ORDER_RELEASED: "Hold released",
  ORDER_FULFILLED: "Sold",
  ORDER_RETURNED: "Returned by a customer",
};

/** Any stock movement's reason in the owner's words, for the history list. */
export function inventoryReasonLabel(reason: InventoryReason): string {
  return REASON_LABELS[reason] ?? "Stock change";
}

/** Movements the shop makes by itself as orders are placed, paid and released. */
const AUTOMATIC_REASONS: readonly InventoryReason[] = ["ORDER_RESERVED", "ORDER_RELEASED", "ORDER_FULFILLED"];

export function isAutomaticReason(reason: InventoryReason): boolean {
  return AUTOMATIC_REASONS.includes(reason);
}

/** The direction a manual reason moves stock ("either" for corrections). */
export function reasonDirection(reason: ManualAdjustReason): StockDirection | "either" {
  return ADJUST_REASON_OPTIONS.find((option) => option.value === reason)?.direction ?? "either";
}

export type StockChangeResolution =
  { ok: true; delta: number } | { ok: false; field: "direction" | "quantity"; message: string };

/**
 * Turns the Adjust stock form's choices into a signed change in pieces:
 * a positive whole quantity, a reason, and (for corrections) add or remove.
 * Restocks and returns always add; damage always removes.
 */
export function resolveStockChange(input: {
  reason: ManualAdjustReason;
  direction?: StockDirection | null;
  quantity: number;
}): StockChangeResolution {
  const { reason, quantity } = input;
  const direction = input.direction ?? null;

  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return { ok: false, field: "quantity", message: "Enter how many pieces, as a whole number above 0." };
  }
  if (quantity > MAX_STOCK_CHANGE) {
    return {
      ok: false,
      field: "quantity",
      message: `That’s more than ${MAX_STOCK_CHANGE.toLocaleString("en-NG")} pieces. Check the number.`,
    };
  }

  const expected = reasonDirection(reason);
  if (expected === "either") {
    if (direction !== "add" && direction !== "remove") {
      return { ok: false, field: "direction", message: "Choose whether to add or remove pieces." };
    }
    return { ok: true, delta: direction === "add" ? quantity : -quantity };
  }

  if (direction !== null && direction !== expected) {
    return {
      ok: false,
      field: "direction",
      message:
        expected === "add"
          ? "This reason adds pieces. Choose “Add pieces”, or pick another reason."
          : "This reason removes pieces. Choose “Remove pieces”, or pick another reason.",
    };
  }
  return { ok: true, delta: expected === "add" ? quantity : -quantity };
}

/* ── What a change would do ──────────────────────────────────────────────── */

export type StockChangeFailure = "not_found" | "below_reserved" | "negative";

export type StockChangePreview =
  | { ok: true; onHand: number; reserved: number; available: number; state: StockState }
  | { ok: false; reason: Exclude<StockChangeFailure, "not_found">; maxRemovable: number };

/**
 * The same rule the database update applies: on hand may never drop below zero
 * or below the pieces held for unpaid orders. Used for the forms' previews and
 * the failure messages; the conditional UPDATE is what actually enforces it.
 */
export function previewStockChange(level: StockLevel, delta: number): StockChangePreview {
  const maxRemovable = Math.max(0, level.onHand - level.reserved);
  const onHand = level.onHand + delta;
  if (onHand < 0) return { ok: false, reason: "negative", maxRemovable };
  if (onHand < level.reserved) return { ok: false, reason: "below_reserved", maxRemovable };
  const next = { onHand, reserved: level.reserved, lowStockThreshold: level.lowStockThreshold };
  return {
    ok: true,
    onHand,
    reserved: level.reserved,
    available: onHand - level.reserved,
    state: stockState(next),
  };
}

/** Changes of this many pieces or more ask for a second look. */
export const LARGE_STOCK_CHANGE = 50;

/**
 * Whether a change is big enough to confirm before saving: 50 pieces or more
 * either way, or taking away at least half of a shelf of 10 or more.
 */
export function isLargeStockChange(delta: number, onHand: number): boolean {
  if (!Number.isFinite(delta) || delta === 0) return false;
  if (Math.abs(delta) >= LARGE_STOCK_CHANGE) return true;
  return delta < 0 && onHand >= 10 && -delta * 2 >= onHand;
}

/** A change in pieces for tables and history: "+5", "−3" (true minus sign), "0". */
export function formatStockDelta(delta: number): string {
  if (!Number.isFinite(delta)) return "—";
  const whole = Math.trunc(delta);
  if (whole === 0) return "0";
  const digits = Math.abs(whole).toLocaleString("en-NG");
  return whole > 0 ? `+${digits}` : `−${digits}`;
}

/** "1 piece", "12 pieces". */
export function pieces(count: number): string {
  return `${count.toLocaleString("en-NG")} ${Math.abs(count) === 1 ? "piece" : "pieces"}`;
}

/** Why a stock change was refused, in a sentence the owner can act on. `level` is the latest reading, when known. */
export function stockChangeFailureMessage(reason: StockChangeFailure, level?: StockLevel | null): string {
  if (reason === "not_found" || !level) {
    return "This item can’t be found any more — it may have been removed. Refresh the page and try again.";
  }
  const available = Math.max(0, level.onHand - level.reserved);
  if (level.reserved <= 0) {
    return level.onHand <= 0
      ? "There’s nothing on hand to remove."
      : `Only ${pieces(level.onHand)} on hand, so you can remove at most ${level.onHand}.`;
  }
  return `${level.reserved.toLocaleString("en-NG")} of the ${pieces(level.onHand)} on hand ${level.reserved === 1 ? "is" : "are"} held for unpaid orders, so you can remove at most ${available} right now. Once those orders are paid or released, you can remove more.`;
}

/* ── What a count would do ───────────────────────────────────────────────── */

export type CountPreview =
  | { ok: true; delta: number; onHand: number; available: number; state: StockState }
  | { ok: false; reason: "below_reserved"; minimum: number };

/**
 * A stocktake sets on hand to the count. It can't go below the pieces held for
 * unpaid orders (the same rule as the database), so a count lower than that is
 * refused until those orders are paid or released.
 */
export function previewCount(level: StockLevel, counted: number): CountPreview {
  if (counted < level.reserved) return { ok: false, reason: "below_reserved", minimum: level.reserved };
  const next = { onHand: counted, reserved: level.reserved, lowStockThreshold: level.lowStockThreshold };
  return {
    ok: true,
    delta: counted - level.onHand,
    onHand: counted,
    available: counted - level.reserved,
    state: stockState(next),
  };
}

/** Why a count lower than the held pieces can't be saved yet. */
export function countBelowReservedMessage(reserved: number): string {
  return `${pieces(reserved)} ${reserved === 1 ? "is" : "are"} held for unpaid orders, so the count can’t be lower than ${reserved.toLocaleString("en-NG")} right now. If pieces are missing, record the count again once those orders are paid or released.`;
}

/** The refusal when on hand moved between opening the count and saving it. */
export function countChangedMessage(expectedOnHand: number, currentOnHand: number): string {
  return `Stock changed while you were counting — review and try again. The record now says ${pieces(currentOnHand)} on hand (it said ${expectedOnHand.toLocaleString("en-NG")} when you started), probably because an order was paid or someone else changed it.`;
}

/* ── Describing a variant and a saved change ─────────────────────────────── */

/** What an admin form needs to know about the variant it changes (serialisable, for client components). */
export interface StockActionTarget extends StockLevel {
  variantId: string;
  sku: string;
  productName: string;
  colorName: string;
  sizeLabel: string;
  /** False when the variant is switched off (not offered in the store). */
  isActive: boolean;
  /** Pieces in paid orders that haven't shipped: already out of on hand, but still on the shelf. */
  awaitingShipment: number;
}

/** "Knitted Polo — Sand, M". */
export function variantLabel(target: { productName: string; colorName: string; sizeLabel: string }): string {
  return `${target.productName} — ${target.colorName}, ${target.sizeLabel}`;
}

/** The success message after an adjustment. */
export function adjustmentSavedMessage(input: {
  label: string;
  delta: number;
  onHand: number;
  reserved: number;
}): string {
  const { label, delta, onHand, reserved } = input;
  const verb = delta >= 0 ? `Added ${pieces(delta)} to` : `Removed ${pieces(-delta)} from`;
  const available = Math.max(0, onHand - reserved);
  return `${verb} ${label}. ${onHand.toLocaleString("en-NG")} on hand, ${available.toLocaleString("en-NG")} available to sell.`;
}

/** The success message after a count. */
export function countSavedMessage(input: { label: string; delta: number; onHand: number }): string {
  const { label, delta, onHand } = input;
  if (delta === 0) return `Count saved for ${label}: ${pieces(onHand)}, matching the record.`;
  const difference = delta > 0 ? `${pieces(delta)} more` : `${pieces(-delta)} fewer`;
  return `Count saved for ${label}: ${pieces(onHand)} on hand, ${difference} than the record said.`;
}

/* ── History ─────────────────────────────────────────────────────────────── */

export interface StockHistoryEntry {
  id: string;
  /** ISO time. */
  createdAt: string;
  onHandDelta: number;
  reservedDelta: number;
  reason: InventoryReason;
  note: string | null;
  order: { id: string; number: string } | null;
  /** The admin who made the change, when recorded and their account still exists. */
  actorEmail: string | null;
}

export interface StockHistoryPage {
  variant: { variantId: string; sku: string; productName: string; colorName: string; sizeLabel: string };
  entries: StockHistoryEntry[];
  /** Pass as `before` to load the next, older page; null when there is none. */
  nextCursor: string | null;
}

/**
 * Who made a movement, for the history list: the admin's email; "Automatic" for
 * the shop's own movements (checkouts, payments, released holds); "Not recorded"
 * otherwise (opening stock from the seed catalogue, or an admin whose account
 * has since been deleted).
 */
export function historyActorLabel(entry: Pick<StockHistoryEntry, "actorEmail" | "reason">): string {
  if (entry.actorEmail) return entry.actorEmail;
  return isAutomaticReason(entry.reason) ? "Automatic" : "Not recorded";
}

/* ── The inventory list's URL ────────────────────────────────────────────── */

export const INVENTORY_PATH = "/admin/inventory";
export const INVENTORY_EXPORT_PATH = "/admin/inventory/export";

export const INVENTORY_SORTS = ["available", "sku", "product"] as const;
export type InventorySort = (typeof INVENTORY_SORTS)[number];

const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

/** ?status=all includes archived products, which are left out by default. */
export const STATUS_ALL = "all";

/** ?inactive=show includes switched-off variants. */
export const SHOW_INACTIVE = "show";

/**
 * The page's allow-list: /admin/inventory?q=polo&state=low_stock&category=knitwear
 * &status=ACTIVE&inactive=show&sort=sku&dir=asc&page=2. Default order: least
 * available first, so what needs restocking is at the top.
 */
export const INVENTORY_LIST_ALLOWED: ListParamsAllowed = {
  sort: INVENTORY_SORTS,
  filters: ["state", "category", "status", "inactive"],
  defaultSort: "available",
  defaultDir: "asc",
  filterValues: {
    state: STOCK_STATES,
    status: [...PRODUCT_STATUSES, STATUS_ALL],
    inactive: [SHOW_INACTIVE],
  },
};

export function parseInventoryListParams(searchParams: RawSearchParams | URLSearchParams): ListParams {
  return parseListParams(searchParams, INVENTORY_LIST_ALLOWED);
}

/** What the inventory queries need, typed and checked. */
export interface InventoryListQuery {
  page: number;
  /** Trimmed search text (SKU or product name), "" for none. */
  q: string;
  state: StockState | null;
  /** A known category slug, or null. */
  categorySlug: string | null;
  /** One product status, or null for every status (archived ones only with includeArchived). */
  productStatus: ProductStatus | null;
  /** Archived products are hidden unless asked for (status=all or status=ARCHIVED). */
  includeArchived: boolean;
  includeInactive: boolean;
  sort: InventorySort;
  dir: SortDir;
}

/** Narrows parsed list params to a query. A category slug not in `categorySlugs` is ignored. */
export function toInventoryListQuery(
  params: ListParams,
  categorySlugs: readonly string[],
): InventoryListQuery {
  const state = params.filters.state;
  const status = params.filters.status;
  const category = params.filters.category;
  const productStatus = (PRODUCT_STATUSES as readonly string[]).includes(status ?? "")
    ? (status as ProductStatus)
    : null;
  return {
    page: params.page,
    q: params.q,
    state: (STOCK_STATES as readonly string[]).includes(state ?? "") ? (state as StockState) : null,
    categorySlug: category && categorySlugs.includes(category) ? category : null,
    productStatus,
    includeArchived: status === STATUS_ALL || productStatus === "ARCHIVED",
    includeInactive: params.filters.inactive === SHOW_INACTIVE,
    sort: (INVENTORY_SORTS as readonly string[]).includes(params.sort)
      ? (params.sort as InventorySort)
      : "available",
    dir: params.dir,
  };
}

/** A search term as an ILIKE pattern matching anywhere, with %, _ and \ taken literally. */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

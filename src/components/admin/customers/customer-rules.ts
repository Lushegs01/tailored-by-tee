import type { ListParams, ListParamsAllowed, SortDir } from "@/lib/admin/pagination";
import type { StatusDisplay } from "@/lib/admin/status";

/*
 * The customers pages' rules, pure (no server or browser APIs), so the server
 * queries, the page, the client bits and the tests all agree:
 *
 * - where each customer is linked (an account page, or the guest view keyed by email);
 * - the list's URL parameters (search, account, orders, sort, page);
 * - how many rows a filter combination has, from one set of counts;
 * - how a typed phone number becomes something the database can match;
 * - the words the owner reads for "guest", "has an account" and the money figures.
 *
 * A "customer" here is one email address. Registered accounts and guest checkouts
 * sit in the same list because the shop lets people buy without an account, and
 * the same person often does both.
 */

/* ── Where things live ───────────────────────────────────────────────────── */

export const CUSTOMERS_PATH = "/admin/customers";

/** Guests have no account row, so their view is keyed by the address they ordered with. */
export const GUEST_CUSTOMER_PATH = "/admin/customers/guest";

const ORDERS_PATH = "/admin/orders";
const PRODUCTS_PATH = "/admin/products";
const REVIEWS_PATH = "/admin/reviews";

/*
 * Two anchors on the Settings page. They are its own section ids
 * (INTEGRATIONS_SECTION_ID and ADMIN_TEAM_SECTION_ID in
 * src/components/admin/settings/), repeated here rather than imported because
 * those modules are server components and this file has to stay pure.
 */
export const SETTINGS_SERVICES_HREF = "/admin/settings#services";
export const SETTINGS_TEAM_HREF = "/admin/settings#admin-team";

/** Longest email address the RFC allows; anything longer is not an address. */
export const MAX_EMAIL_LENGTH = 254;

// Deliberately loose: this only decides whether a lookup is worth making. The
// value is always passed to the database as a bound parameter, never inlined.
const EMAIL_SHAPE = /^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+$/;

/**
 * A customer email address, trimmed and lower-cased, or null when it isn't one.
 * Checkout stores every order's email lower-cased and the accounts adapter does
 * the same, so lower case is the one form used to match them.
 */
export function normaliseCustomerEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL_SHAPE.test(email) ? email : null;
}

// The shape every id in this database has (cuid, or a demo id like
// "demo_user_ada"). The same expression as zId in lib/admin/validation; anything
// else is refused before a lookup is made, so /admin/customers/<junk> is a 404
// rather than a query.
const ID_SHAPE = /^[A-Za-z0-9_.:-]{1,191}$/;

/** True when this could be a customer id at all. */
export function isCustomerId(value: string): boolean {
  return ID_SHAPE.test(value);
}

/** The page for one registered customer. */
export function customerPath(userId: string): string {
  return `${CUSTOMERS_PATH}/${encodeURIComponent(userId)}`;
}

/** The read-only view of everything one guest email address has ordered. */
export function guestCustomerHref(email: string): string {
  return `${GUEST_CUSTOMER_PATH}?email=${encodeURIComponent(email)}`;
}

/** Where a row in the list goes: the account page when there is one, else the guest view. */
export function customerHref(row: { userId: string | null; email: string }): string {
  return row.userId ? customerPath(row.userId) : guestCustomerHref(row.email);
}

/** Every order placed with this address, in the orders list. */
export function customerOrdersHref(email: string): string {
  return `${ORDERS_PATH}?q=${encodeURIComponent(email)}`;
}

export function orderHref(number: string): string {
  return `${ORDERS_PATH}/${encodeURIComponent(number)}`;
}

export function productHref(productId: string): string {
  return `${PRODUCTS_PATH}/${encodeURIComponent(productId)}`;
}

/** This customer's reviews in the moderation list. */
export function customerReviewsHref(productId: string): string {
  return `${REVIEWS_PATH}?product=${encodeURIComponent(productId)}`;
}

/* ── The list's URL ──────────────────────────────────────────────────────── */

export const CUSTOMER_SORTS = ["lastOrder", "spent", "orders", "newest", "name"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export type CustomerAccountFilter = "registered" | "guest";
export type CustomerOrdersFilter = "with" | "without";

export const CUSTOMER_ACCOUNT_OPTIONS: readonly { value: CustomerAccountFilter; label: string }[] = [
  { value: "registered", label: "With an account" },
  { value: "guest", label: "Guest checkouts" },
];

export const CUSTOMER_ORDERS_OPTIONS: readonly { value: CustomerOrdersFilter; label: string }[] = [
  { value: "with", label: "Has ordered" },
  { value: "without", label: "Never ordered" },
];

export const CUSTOMER_LIST_ALLOWED: ListParamsAllowed = {
  sort: CUSTOMER_SORTS,
  filters: ["account", "orders"],
  defaultSort: "lastOrder",
  defaultDir: "desc",
  filterValues: {
    account: CUSTOMER_ACCOUNT_OPTIONS.map((option) => option.value),
    orders: CUSTOMER_ORDERS_OPTIONS.map((option) => option.value),
  },
};

export interface CustomerListQuery {
  page: number;
  /** Trimmed search text, "" when none. */
  q: string;
  sort: CustomerSort;
  dir: SortDir;
  account: CustomerAccountFilter | null;
  orders: CustomerOrdersFilter | null;
}

function asSort(value: string): CustomerSort {
  return (CUSTOMER_SORTS as readonly string[]).includes(value) ? (value as CustomerSort) : "lastOrder";
}

/** The parsed URL as the query the customers service takes. */
export function toCustomerListQuery(params: ListParams): CustomerListQuery {
  const account = params.filters.account;
  const orders = params.filters.orders;
  return {
    page: params.page,
    q: params.q,
    sort: asSort(params.sort),
    dir: params.dir,
    account: account === "registered" || account === "guest" ? account : null,
    orders: orders === "with" || orders === "without" ? orders : null,
  };
}

/** True when the list is narrowed at all, so an empty result can offer to clear it. */
export function hasCustomerFilters(query: Pick<CustomerListQuery, "q" | "account" | "orders">): boolean {
  return query.q !== "" || query.account !== null || query.orders !== null;
}

/* ── Counting the filters ────────────────────────────────────────────────── */

/**
 * The four counts the summary query returns, over everything the search matched
 * and before the account and orders filters. Every filter combination can be
 * worked out from them, so the list needs one count query rather than five.
 */
export interface CustomerCounts {
  /** Every customer matching the search. */
  total: number;
  /** Of those, the ones with an account. */
  registered: number;
  /** Of those accounts, the ones that have ordered. */
  registeredWithOrders: number;
  /** Everyone matching the search who has ordered (accounts and guests). */
  withOrders: number;
}

/** How many rows the current filters leave, for pagination. */
export function customerTotalFor(
  counts: CustomerCounts,
  query: Pick<CustomerListQuery, "account" | "orders">,
): number {
  const total = Math.max(0, counts.total);
  const registered = Math.min(Math.max(0, counts.registered), total);
  const registeredWithOrders = Math.min(Math.max(0, counts.registeredWithOrders), registered);
  const withOrders = Math.min(Math.max(0, counts.withOrders), total);
  const guests = total - registered;

  if (query.account === "registered") {
    if (query.orders === "with") return registeredWithOrders;
    if (query.orders === "without") return registered - registeredWithOrders;
    return registered;
  }
  if (query.account === "guest") {
    // A guest row exists only because an order was placed with that address,
    // so "never ordered" can never match one.
    return query.orders === "without" ? 0 : guests;
  }
  if (query.orders === "with") return withOrders;
  if (query.orders === "without") return total - withOrders;
  return total;
}

/* ── Searching ───────────────────────────────────────────────────────────── */

const PHONE_SHAPE = /^[+\d\s().-]+$/;

/**
 * A Nigerian number typed into the search box, reduced to the ten national digits
 * the stored number ends with: "0803 123 4567", "+234 803 123 4567" and
 * "8031234567" all become "8031234567", which matches every stored form. Null
 * when the text isn't a number at all, or is too short to narrow anything down.
 * Follows the same leading-zero and country-code rules as
 * normalizeNigerianPhone in lib/commerce/phone, but accepts a partial number.
 */
export function phoneSearchDigits(query: string): string | null {
  const text = query.trim();
  if (text === "" || !PHONE_SHAPE.test(text)) return null;

  const digits = text.replace(/\D/g, "");
  if (digits.length < 4) return null;

  let national = digits;
  if (national.startsWith("234")) national = national.slice(3);
  if (national.startsWith("0")) national = national.slice(1);
  return national.length >= 3 ? national : null;
}

/* ── When nothing can be read ────────────────────────────────────────────── */

/**
 * Why a customers page has nothing to show. Declared here, where both the
 * service that returns it and the panel that explains it can see it, so the two
 * can never drift apart.
 */
export type CustomerLoadFailure = "not_configured" | "needs_migration" | "unavailable";

/* ── Words for the owner ─────────────────────────────────────────────────── */

const HAS_ACCOUNT: StatusDisplay = {
  label: "Has an account",
  tone: "positive",
  description: "They can sign in to see their orders, save addresses and keep a wishlist.",
};

const GUEST: StatusDisplay = {
  label: "Guest",
  tone: "neutral",
  description: "They checked out without creating an account. Everything here comes from their orders.",
};

/** "Has an account" or "Guest", with a sentence for the detail page. */
export function accountDisplay(hasAccount: boolean): StatusDisplay {
  return hasAccount ? HAS_ACCOUNT : GUEST;
}

/** What to call a customer: the name they gave, otherwise their email address. */
export function customerName(row: { name: string | null; email: string }): string {
  const name = row.name?.trim();
  return name && name !== "" ? name : row.email;
}

/**
 * Exactly what "Total spent" counts, said once and reused everywhere. It is the
 * same rule the Overview's revenue uses, with one deliberate difference, named
 * in DEMO_MONEY_NOTE: a demo customer's own demo orders are counted here.
 */
export const SPEND_NOTE =
  "Total spent counts every order the customer has paid for and that is going ahead, less any refund Paystack has returned. Order totals include delivery, and any discount already taken off. Unpaid checkouts and cancelled orders aren’t counted, and an order refunded in full drops out altogether.";

/** Test payments are never mixed into the money figures. */
export const TEST_MONEY_NOTE =
  "Payments made with Paystack test keys are counted on their own, never with real money.";

/** Demo rows come from npm run db:seed:demo and are removed by npm run db:clear-demo. */
export const DEMO_NOTE = "Demo content for evaluation, added by the sample-data script. Not a real customer.";

/**
 * Why these figures and the Overview's sales can differ while sample data is
 * installed. Shown only when there is demo content to explain.
 */
export const DEMO_MONEY_NOTE =
  "A demo customer’s figures include their demo orders, so they read as a real customer’s would. The Overview’s sales leave demo orders out, so the two won’t agree until the sample data is removed.";

/**
 * The figures above the list describe everyone the search matched, before the
 * Account and Orders filters — that is what makes them worth clicking. Said out
 * loud as soon as a filter is on, so the headline and the list never look like a
 * contradiction.
 */
export function summaryScopeNote(query: Pick<CustomerListQuery, "account" | "orders">): string | null {
  if (query.account === null && query.orders === null) return null;
  return "These figures cover everyone matching the search. The list below is narrowed by the filters.";
}

/** Why this page never lets anyone change a customer's details. */
export const READ_ONLY_NOTE =
  "Customer details are read-only here: they belong to the customer, who changes them in their own account. Admin access is given and taken away in Settings.";

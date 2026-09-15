import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { deliveryAddressShape as checkoutAddress } from "@/lib/commerce/checkout-schema";
import { getDb, isDatabaseConfigured } from "@/lib/db";

/*
 * The address book. Every read and write is scoped by the user id the server
 * took from the session — an id sent by the browser only ever narrows a query
 * within that user's own rows, so a guessed id can never reach anyone else's.
 *
 * Invariant: whenever a user has addresses, exactly one is the default. Each
 * write runs in one transaction that first locks the user's row, so concurrent
 * requests (two tabs, a double tap) queue instead of both seeing "no default
 * yet" or both slipping under the limit.
 */

export const MAX_ADDRESSES = 10;

export interface SavedAddress {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  /** Nigerian state code as used by the checkout state select, e.g. "LA". */
  state: string;
  postalCode: string | null;
  isDefault: boolean;
}

/* ── Validation ────────────────────────────────────────────────────────── */

/*
 * Checkout owns the address rules; reusing its fields (not copies of them)
 * guarantees a saved address always passes checkout.
 */
export const addressInputSchema = z.object({
  label: z
    .string()
    .trim()
    .max(40, "Keep the label to 40 characters or fewer.")
    .optional()
    .transform((value) => (value ? value : undefined)),
  fullName: checkoutAddress.fullName,
  phone: checkoutAddress.phone,
  line1: checkoutAddress.line1,
  line2: checkoutAddress.line2,
  city: checkoutAddress.city,
  state: checkoutAddress.state,
  postalCode: checkoutAddress.postalCode,
  /** Make this the default. The first address is the default whatever this says. */
  makeDefault: z.boolean().default(false),
});

export type AddressInput = z.input<typeof addressInputSchema>;
type ParsedAddress = z.output<typeof addressInputSchema>;

export type AddressField = "label" | "fullName" | "phone" | "line1" | "line2" | "city" | "state" | "postalCode";
export type AddressFieldErrors = Partial<Record<AddressField, string>>;

const ADDRESS_FIELDS = new Set<string>([
  "label",
  "fullName",
  "phone",
  "line1",
  "line2",
  "city",
  "state",
  "postalCode",
] satisfies AddressField[]);

/** First message per field, for inline errors. */
export function addressFieldErrors(error: z.ZodError): AddressFieldErrors {
  const errors: AddressFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && ADDRESS_FIELDS.has(field) && !(field in errors)) {
      errors[field as AddressField] = issue.message;
    }
  }
  return errors;
}

/* ── Results ───────────────────────────────────────────────────────────── */

type Failure<Reason extends string> = { ok: false; reason: Reason; message: string };

export type AddressWriteResult =
  | { ok: true; address: SavedAddress }
  | { ok: false; reason: "invalid"; message: string; fieldErrors: AddressFieldErrors }
  | Failure<"not_found" | "limit" | "unavailable">;

export type AddressChangeResult = { ok: true } | Failure<"not_found" | "unavailable">;

const NOT_FOUND: Failure<"not_found"> = {
  ok: false,
  reason: "not_found",
  message: "We couldn’t find that address — it may already have been removed.",
};
const UNAVAILABLE: Failure<"unavailable"> = {
  ok: false,
  reason: "unavailable",
  message: "Saved addresses aren’t available right now. Please try again soon.",
};
const LIMIT: Failure<"limit"> = {
  ok: false,
  reason: "limit",
  message: `You can save up to ${MAX_ADDRESSES} addresses. Delete one to add another.`,
};

function invalid(error: z.ZodError): AddressWriteResult {
  const fieldErrors = addressFieldErrors(error);
  return {
    ok: false,
    reason: "invalid",
    message:
      Object.keys(fieldErrors).length > 0
        ? "Please check the highlighted details."
        : "We couldn’t read that address. Please refresh the page and try again.",
    fieldErrors,
  };
}

/* ── Rows ──────────────────────────────────────────────────────────────── */

const ADDRESS_SELECT = {
  id: true,
  label: true,
  fullName: true,
  phone: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
  postalCode: true,
  isDefault: true,
} as const;

interface AddressRow {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  isDefault: boolean;
}

function toSavedAddress(row: AddressRow): SavedAddress {
  return {
    id: row.id,
    label: row.label,
    fullName: row.fullName,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    isDefault: row.isDefault,
  };
}

function toColumns(address: Omit<ParsedAddress, "makeDefault">) {
  return {
    label: address.label ?? null,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? null,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode ?? null,
  };
}

/** Ids are cuids; anything else can't be one of ours, so it is simply not found. */
function isAddressId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 64 && /^[A-Za-z0-9_-]+$/.test(id);
}

const TRANSACTION = { maxWait: 5_000, timeout: 10_000 } as const;

/**
 * Serialises address writes per user for the rest of the transaction.
 * False when the user no longer exists (a session outliving its account).
 */
async function lockAddressBook(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  return rows.length === 1;
}

/**
 * Restores "exactly one default" after a change: with none (the default was
 * deleted), the most recently updated address is promoted; with several (only
 * possible from older data), the most recently updated default is kept.
 */
async function settleDefault(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const defaults = await tx.address.findMany({
    where: { userId, isDefault: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  const [keep, ...extra] = defaults;

  if (keep) {
    if (extra.length > 0) {
      await tx.address.updateMany({
        where: { userId, isDefault: true, id: { not: keep.id } },
        data: { isDefault: false },
      });
    }
    return;
  }

  const newest = await tx.address.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (newest) await tx.address.updateMany({ where: { id: newest.id, userId }, data: { isDefault: true } });
}

/* ── Reads ─────────────────────────────────────────────────────────────── */

/** The user's addresses: the default first, then the most recently updated. */
export async function listAddresses(userId: string): Promise<SavedAddress[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getDb().address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    select: ADDRESS_SELECT,
    // A ceiling for safety; the write path never lets a book grow past MAX_ADDRESSES.
    take: 50,
  });
  return rows.map(toSavedAddress);
}

/** The default address (or, defensively, the most recently updated one), for prefilling checkout. */
export async function getDefaultAddress(userId: string): Promise<SavedAddress | null> {
  if (!isDatabaseConfigured()) return null;
  const row = await getDb().address.findFirst({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    select: ADDRESS_SELECT,
  });
  return row ? toSavedAddress(row) : null;
}

/* ── Writes ────────────────────────────────────────────────────────────── */

/** Adds an address. The first one becomes the default; so does any saved with `makeDefault`. */
export async function createAddress(userId: string, input: unknown): Promise<AddressWriteResult> {
  if (!isDatabaseConfigured()) return UNAVAILABLE;
  const parsed = addressInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { makeDefault, ...address } = parsed.data;

  return getDb().$transaction(async (tx): Promise<AddressWriteResult> => {
    if (!(await lockAddressBook(tx, userId))) return UNAVAILABLE;

    const count = await tx.address.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) return LIMIT;

    const isDefault = count === 0 || makeDefault;
    if (isDefault) {
      await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    }
    const row = await tx.address.create({
      data: { userId, ...toColumns(address), isDefault },
      select: ADDRESS_SELECT,
    });
    return { ok: true, address: toSavedAddress(row) };
  }, TRANSACTION);
}

/** Replaces an address's details. A default stays the default; `makeDefault` promotes this one. */
export async function updateAddress(userId: string, id: string, input: unknown): Promise<AddressWriteResult> {
  if (!isDatabaseConfigured()) return UNAVAILABLE;
  if (!isAddressId(id)) return NOT_FOUND;
  const parsed = addressInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { makeDefault, ...address } = parsed.data;

  return getDb().$transaction(async (tx): Promise<AddressWriteResult> => {
    if (!(await lockAddressBook(tx, userId))) return NOT_FOUND;

    // Ownership is part of the filter, so nothing changes unless the row is this user's.
    const { count } = await tx.address.updateMany({
      where: { id, userId },
      data: { ...toColumns(address), ...(makeDefault ? { isDefault: true } : {}) },
    });
    if (count === 0) return NOT_FOUND;

    if (makeDefault) {
      await tx.address.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    await settleDefault(tx, userId);

    const row = await tx.address.findFirst({ where: { id, userId }, select: ADDRESS_SELECT });
    return row ? { ok: true, address: toSavedAddress(row) } : NOT_FOUND;
  }, TRANSACTION);
}

/** Deletes an address. Deleting the default promotes the most recently updated remaining one. */
export async function deleteAddress(userId: string, id: string): Promise<AddressChangeResult> {
  if (!isDatabaseConfigured()) return UNAVAILABLE;
  if (!isAddressId(id)) return NOT_FOUND;

  return getDb().$transaction(async (tx): Promise<AddressChangeResult> => {
    if (!(await lockAddressBook(tx, userId))) return NOT_FOUND;

    const { count } = await tx.address.deleteMany({ where: { id, userId } });
    if (count === 0) return NOT_FOUND;

    await settleDefault(tx, userId);
    return { ok: true };
  }, TRANSACTION);
}

/** Makes one address the default and every other one not. */
export async function setDefaultAddress(userId: string, id: string): Promise<AddressChangeResult> {
  if (!isDatabaseConfigured()) return UNAVAILABLE;
  if (!isAddressId(id)) return NOT_FOUND;

  return getDb().$transaction(async (tx): Promise<AddressChangeResult> => {
    if (!(await lockAddressBook(tx, userId))) return NOT_FOUND;

    const { count } = await tx.address.updateMany({ where: { id, userId }, data: { isDefault: true } });
    if (count === 0) return NOT_FOUND;

    await tx.address.updateMany({
      where: { userId, isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
    return { ok: true };
  }, TRANSACTION);
}

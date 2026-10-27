"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
  type AddressFieldErrors,
  type AddressWriteResult,
  type SavedAddress,
} from "@/lib/account/addresses";
import { getCurrentUser } from "@/lib/auth/session";
import { clientAddress, rateLimit } from "@/lib/security/rate-limit";

/*
 * Address book actions. Public POST endpoints like any server action: each one
 * rate-limits, takes the user from the session (never from the request), and
 * re-validates its input; the lib layer scopes every write by { id, userId }.
 */

export type AddressActionCode =
  | "signed_out"
  | "rate_limited"
  | "invalid"
  | "not_found"
  | "limit"
  | "unavailable"
  | "failed";

export type AddressSaveResult =
  | { ok: true; message: string; address: SavedAddress }
  | { ok: false; code: AddressActionCode; message: string; fieldErrors?: AddressFieldErrors };

export type AddressChangeActionResult = { ok: true; message: string } | { ok: false; code: AddressActionCode; message: string };

type Failure = { ok: false; code: AddressActionCode; message: string };

const RATE_LIMITED: Failure = {
  ok: false,
  code: "rate_limited",
  message: "Too many changes in a short time. Please wait a few minutes and try again.",
};
const SIGNED_OUT: Failure = {
  ok: false,
  code: "signed_out",
  message: "You’ve been signed out. Sign in again to manage your addresses.",
};
const FAILED: Failure = { ok: false, code: "failed", message: "We couldn’t save that change just now. Please try again." };

const addressIdSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const idInputSchema = z.object({ id: addressIdSchema });
const editInputSchema = z.object({ id: addressIdSchema, address: z.unknown() });

async function authorise(): Promise<{ ok: true; userId: string } | Failure> {
  // Checked before the session lookup, so unauthenticated floods stay cheap.
  if (!rateLimit(`account-addresses-ip:${await clientAddress()}`, { limit: 60, windowMs: 10 * 60_000 }).ok) {
    return RATE_LIMITED;
  }
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  if (!rateLimit(`account-addresses:${user.id}`, { limit: 30, windowMs: 10 * 60_000 }).ok) return RATE_LIMITED;
  return { ok: true, userId: user.id };
}

function revalidateAccount() {
  revalidatePath("/account/addresses");
  revalidatePath("/account");
}

function saveFailure(result: Exclude<AddressWriteResult, { ok: true }>): AddressSaveResult {
  // A stale row (removed in another tab) is gone from the page on the next render.
  if (result.reason === "not_found") revalidateAccount();
  return result.reason === "invalid"
    ? { ok: false, code: "invalid", message: result.message, fieldErrors: result.fieldErrors }
    : { ok: false, code: result.reason, message: result.message };
}

export async function addAddress(input: unknown): Promise<AddressSaveResult> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  try {
    const result = await createAddress(auth.userId, input);
    if (!result.ok) return saveFailure(result);
    revalidateAccount();
    return { ok: true, message: "Address saved.", address: result.address };
  } catch (error) {
    console.error("[account] could not add an address", error);
    return FAILED;
  }
}

export async function editAddress(input: unknown): Promise<AddressSaveResult> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  const parsed = editInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not_found", message: "We couldn’t find that address." };

  try {
    const result = await updateAddress(auth.userId, parsed.data.id, parsed.data.address);
    if (!result.ok) return saveFailure(result);
    revalidateAccount();
    return { ok: true, message: "Address updated.", address: result.address };
  } catch (error) {
    console.error("[account] could not update an address", error);
    return FAILED;
  }
}

export async function removeAddress(input: unknown): Promise<AddressChangeActionResult> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  const parsed = idInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not_found", message: "We couldn’t find that address." };

  try {
    const result = await deleteAddress(auth.userId, parsed.data.id);
    revalidateAccount();
    if (!result.ok) return { ok: false, code: result.reason, message: result.message };
    return { ok: true, message: "Address deleted." };
  } catch (error) {
    console.error("[account] could not delete an address", error);
    return { ...FAILED, message: "We couldn’t delete that address just now. Please try again." };
  }
}

export async function makeDefaultAddress(input: unknown): Promise<AddressChangeActionResult> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  const parsed = idInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not_found", message: "We couldn’t find that address." };

  try {
    const result = await setDefaultAddress(auth.userId, parsed.data.id);
    revalidateAccount();
    if (!result.ok) return { ok: false, code: result.reason, message: result.message };
    return { ok: true, message: "Default address updated." };
  } catch (error) {
    console.error("[account] could not change the default address", error);
    return FAILED;
  }
}

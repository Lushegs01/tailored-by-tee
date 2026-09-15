import { findState } from "@/config/nigeria";
import type { SavedAddress } from "@/lib/account/addresses";
import { formatNigerianPhone, normalizeNigerianPhone } from "@/lib/commerce/phone";

import type { CheckoutFormState } from "./checkout-draft";

export type { SavedAddress };

/*
 * A signed-in customer's details, offered to the checkout form. The tab's own
 * draft always wins: prefill only fills what the draft left empty, so a refresh
 * never throws away what was typed. Every prefilled value stays editable, and the
 * server validates the submitted form exactly as it does for a guest. Pure, so it
 * runs in the browser.
 */

export interface CheckoutPrefill {
  /** The account email (lower-case). Editable: a customer may want this order confirmed elsewhere. */
  email: string;
  fullName: string | null;
  phone: string | null;
  /** Default first, then most recently updated. */
  addresses: SavedAddress[];
}

export type AddressFields = Pick<CheckoutFormState, "line1" | "line2" | "city" | "state" | "postalCode">;

const ADDRESS_KEYS = ["line1", "line2", "city", "state", "postalCode"] as const satisfies readonly (keyof AddressFields)[];

export const EMPTY_ADDRESS: AddressFields = { line1: "", line2: "", city: "", state: "", postalCode: "" };

/**
 * A stored number as a person reads it, "+234 803 123 4567" — still accepted by the
 * phone field, which normalises whatever is typed. Anything unrecognised is shown
 * as saved and checked on submit like any typed number.
 */
export function phoneForField(phone: string | null | undefined): string {
  if (!phone) return "";
  const normalized = normalizeNigerianPhone(phone);
  return normalized ? formatNigerianPhone(normalized) : phone;
}

/** A saved address as the checkout's address fields. */
export function addressFields(address: SavedAddress): AddressFields {
  return {
    line1: address.line1,
    line2: address.line2 ?? "",
    city: address.city,
    // The state select's values are the codes in config/nigeria. An unknown code would
    // show a different state than the one sent, so it is left for the customer to choose.
    state: findState(address.state)?.code ?? "",
    postalCode: address.postalCode ?? "",
  };
}

/** Just the address fields of the form. */
export function addressOf(form: AddressFields): AddressFields {
  return { line1: form.line1, line2: form.line2, city: form.city, state: form.state, postalCode: form.postalCode };
}

export function hasAddress(fields: AddressFields): boolean {
  return ADDRESS_KEYS.some((key) => fields[key].trim() !== "");
}

function sameAddress(a: AddressFields, b: AddressFields): boolean {
  return ADDRESS_KEYS.every((key) => a[key].trim().toLowerCase() === b[key].trim().toLowerCase());
}

/**
 * The saved address the form currently holds, or null for a new one. Derived from
 * the fields themselves, so editing a chosen address shows it as a new address —
 * which is what it now is.
 */
export function matchingAddressId(fields: AddressFields, addresses: readonly SavedAddress[]): string | null {
  if (!hasAddress(fields)) return null;
  return addresses.find((address) => sameAddress(addressFields(address), fields))?.id ?? null;
}

function filled(value: string): boolean {
  return value.trim() !== "";
}

/**
 * The form's starting state: the tab's draft, with any field it left empty filled
 * from the account. The address is taken as a whole — a default address is only
 * preselected when the draft has no address at all, never merged into a partial one.
 */
export function initialCheckoutForm(draft: CheckoutFormState, prefill: CheckoutPrefill | undefined): CheckoutFormState {
  if (!prefill) return draft;
  const defaultAddress = prefill.addresses.find((address) => address.isDefault) ?? null;

  const fullName = [draft.fullName, prefill.fullName ?? "", defaultAddress?.fullName ?? ""].find(filled) ?? "";
  const email = filled(draft.email) ? draft.email : prefill.email;
  const phone = filled(draft.phone) ? draft.phone : phoneForField(prefill.phone ?? defaultAddress?.phone);
  const address = !hasAddress(draft) && defaultAddress ? addressFields(defaultAddress) : addressOf(draft);

  return { ...draft, fullName, email, phone, ...address };
}

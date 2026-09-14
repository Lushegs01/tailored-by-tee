import type { DeliveryMethod } from "@/lib/commerce/delivery";

/*
 * Checkout form state and its draft in sessionStorage — kept per tab and gone
 * when the tab closes, so a refresh never loses what was typed, without keeping
 * contact details on the device afterwards. Values read back are untrusted and
 * re-checked; the server validates everything again regardless.
 */

export interface CheckoutFormState {
  fullName: string;
  email: string;
  phone: string;
  newsletter: boolean;
  deliveryMethod: DeliveryMethod;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  deliveryNotes: string;
  /** The discount code the shopper asked for (the server decides if it applies). */
  couponCode: string | null;
}

export const EMPTY_CHECKOUT_FORM: CheckoutFormState = {
  fullName: "",
  email: "",
  phone: "",
  newsletter: false,
  deliveryMethod: "delivery",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  deliveryNotes: "",
  couponCode: null,
};

const DRAFT_KEY = "tbt.checkout.draft.v1";
const SESSION_KEY = "tbt.checkout.session.v1";
const SESSION_ID = /^[A-Za-z0-9_-]{16,64}$/;

function tabStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function sanitize(value: unknown): CheckoutFormState {
  if (!value || typeof value !== "object") return EMPTY_CHECKOUT_FORM;
  const draft = value as Record<string, unknown>;
  const text = (key: string, max: number) => (typeof draft[key] === "string" ? (draft[key] as string).slice(0, max) : "");

  return {
    fullName: text("fullName", 100),
    email: text("email", 254),
    phone: text("phone", 32),
    newsletter: draft.newsletter === true,
    deliveryMethod: draft.deliveryMethod === "pickup" ? "pickup" : "delivery",
    line1: text("line1", 200),
    line2: text("line2", 200),
    city: text("city", 100),
    state: text("state", 2),
    postalCode: text("postalCode", 10),
    deliveryNotes: text("deliveryNotes", 500),
    couponCode: text("couponCode", 32) || null,
  };
}

export function loadCheckoutDraft(): CheckoutFormState {
  try {
    const raw = tabStorage()?.getItem(DRAFT_KEY);
    return raw ? sanitize(JSON.parse(raw)) : EMPTY_CHECKOUT_FORM;
  } catch {
    return EMPTY_CHECKOUT_FORM;
  }
}

export function saveCheckoutDraft(state: CheckoutFormState): void {
  try {
    tabStorage()?.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable: the form still works, it just won't survive a refresh.
  }
}

export function clearCheckoutDraft(): void {
  try {
    tabStorage()?.removeItem(DRAFT_KEY);
    tabStorage()?.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored.
  }
}

function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID().replace(/-/g, "");
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A random id for this tab's checkout, reused across attempts so retries and replacements are recognised. */
export function getCheckoutSessionId(): string {
  const storage = tabStorage();
  try {
    const existing = storage?.getItem(SESSION_KEY);
    if (existing && SESSION_ID.test(existing)) return existing;
  } catch {
    // Fall through to a fresh id.
  }
  const id = randomId();
  try {
    storage?.setItem(SESSION_KEY, id);
  } catch {
    // Unstored ids still work for this page view.
  }
  return id;
}

/** The details the server's schema expects (everything but the discount code); address fields are ignored for collection. */
export function toCheckoutDetails(state: CheckoutFormState) {
  return {
    fullName: state.fullName,
    email: state.email,
    phone: state.phone,
    newsletter: state.newsletter,
    deliveryMethod: state.deliveryMethod,
    line1: state.line1,
    line2: state.line2,
    city: state.city,
    state: state.state,
    postalCode: state.postalCode,
    deliveryNotes: state.deliveryNotes,
  };
}

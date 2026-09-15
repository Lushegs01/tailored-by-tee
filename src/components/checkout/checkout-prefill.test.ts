import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NIGERIAN_STATES } from "@/config/nigeria";
import { checkoutDetailsSchema } from "@/lib/commerce/checkout-schema";
import { normalizeNigerianPhone } from "@/lib/commerce/phone";

import { EMPTY_CHECKOUT_FORM, toCheckoutDetails, type CheckoutFormState } from "./checkout-draft";
import {
  addressFields,
  initialCheckoutForm,
  matchingAddressId,
  phoneForField,
  type CheckoutPrefill,
  type SavedAddress,
} from "./checkout-prefill";

const home: SavedAddress = {
  id: "addr_home",
  label: "Home",
  fullName: "Adaeze Okafor",
  phone: "+2348031234567",
  line1: "14 Admiralty Way",
  line2: "Lekki Phase 1",
  city: "Lagos",
  state: "LA",
  postalCode: "106104",
  isDefault: true,
};

const studio: SavedAddress = {
  id: "addr_studio",
  label: null,
  fullName: "Adaeze Okafor",
  phone: "+2349051112222",
  line1: "3 Aminu Kano Crescent",
  line2: null,
  city: "Wuse II",
  state: "FC",
  postalCode: null,
  isDefault: false,
};

const prefill: CheckoutPrefill = {
  email: "adaeze@example.com",
  fullName: "Adaeze Okafor",
  phone: "+2348031234567",
  addresses: [home, studio],
};

function draft(patch: Partial<CheckoutFormState> = {}): CheckoutFormState {
  return { ...EMPTY_CHECKOUT_FORM, ...patch };
}

describe("initialCheckoutForm", () => {
  it("leaves a guest's draft exactly as it was", () => {
    const guest = draft({ email: "guest@example.com", city: "Ikeja" });
    assert.equal(initialCheckoutForm(guest, undefined), guest);
  });

  it("fills an empty form from the account and preselects the default address", () => {
    const form = initialCheckoutForm(draft(), prefill);
    assert.equal(form.email, "adaeze@example.com");
    assert.equal(form.fullName, "Adaeze Okafor");
    assert.equal(form.phone, "+234 803 123 4567");
    assert.deepEqual(
      { line1: form.line1, line2: form.line2, city: form.city, state: form.state, postalCode: form.postalCode },
      { line1: "14 Admiralty Way", line2: "Lekki Phase 1", city: "Lagos", state: "LA", postalCode: "106104" },
    );
    assert.equal(matchingAddressId(form, prefill.addresses), "addr_home");
  });

  it("keeps every field the draft already has, filling only the gaps", () => {
    const form = initialCheckoutForm(draft({ email: "other@example.com", phone: "0701 111 2222", deliveryNotes: "Gate 2" }), prefill);
    assert.equal(form.email, "other@example.com");
    assert.equal(form.phone, "0701 111 2222");
    assert.equal(form.fullName, "Adaeze Okafor");
    assert.equal(form.deliveryNotes, "Gate 2");
  });

  it("treats a whitespace-only draft field as empty", () => {
    assert.equal(initialCheckoutForm(draft({ email: "   " }), prefill).email, "adaeze@example.com");
  });

  it("never merges a saved address into a partly typed one", () => {
    const form = initialCheckoutForm(draft({ state: "OY" }), prefill);
    assert.equal(form.state, "OY");
    assert.equal(form.line1, "");
    assert.equal(form.city, "");
    assert.equal(matchingAddressId(form, prefill.addresses), null);
  });

  it("preselects nothing when no saved address is the default", () => {
    const form = initialCheckoutForm(draft(), { ...prefill, addresses: [{ ...home, isDefault: false }, studio] });
    assert.equal(form.line1, "");
    assert.equal(form.state, "");
  });

  it("falls back to the default address for a missing name and phone", () => {
    const form = initialCheckoutForm(draft(), { ...prefill, fullName: null, phone: null });
    assert.equal(form.fullName, "Adaeze Okafor");
    assert.equal(form.phone, "+234 803 123 4567");
  });

  it("keeps the delivery method and discount code from the draft", () => {
    const form = initialCheckoutForm(draft({ deliveryMethod: "pickup", couponCode: "WELCOME10" }), prefill);
    assert.equal(form.deliveryMethod, "pickup");
    assert.equal(form.couponCode, "WELCOME10");
    // The default address is ready if they switch back to delivery.
    assert.equal(form.line1, "14 Admiralty Way");
  });

  it("produces details the checkout schema accepts, phone normalised back to E.164", () => {
    const parsed = checkoutDetailsSchema.safeParse(toCheckoutDetails(initialCheckoutForm(draft(), prefill)));
    assert.ok(parsed.success);
    assert.equal(parsed.data.phone, "+2348031234567");
    assert.equal(parsed.data.deliveryMethod === "delivery" && parsed.data.state, "LA");
  });
});

describe("addressFields", () => {
  it("maps nulls to empty fields", () => {
    const fields = addressFields(studio);
    assert.equal(fields.line2, "");
    assert.equal(fields.postalCode, "");
    assert.equal(fields.state, "FC");
  });

  it("uses the state select's option values", () => {
    const values = new Set<string>(NIGERIAN_STATES.map((state) => state.code));
    for (const state of NIGERIAN_STATES) assert.ok(values.has(addressFields({ ...home, state: state.code }).state));
    assert.equal(addressFields({ ...home, state: "la" }).state, "LA");
  });

  it("leaves an unknown state for the customer to choose", () => {
    assert.equal(addressFields({ ...home, state: "XX" }).state, "");
  });
});

describe("matchingAddressId", () => {
  it("finds the saved address the fields hold, ignoring case and surrounding spaces", () => {
    const fields = { ...addressFields(studio), line1: " 3 AMINU KANO CRESCENT " };
    assert.equal(matchingAddressId(fields, prefill.addresses), "addr_studio");
  });

  it("reads an edited address as a new one", () => {
    assert.equal(matchingAddressId({ ...addressFields(home), line2: "Gate 4" }, prefill.addresses), null);
  });

  it("reads empty fields as a new address", () => {
    assert.equal(matchingAddressId(draft(), prefill.addresses), null);
  });
});

describe("phoneForField", () => {
  it("shows a stored number the way people read it, and the field accepts it back", () => {
    for (const stored of ["+2348031234567", "08031234567", "0803 123 4567"]) {
      assert.equal(phoneForField(stored), "+234 803 123 4567", stored);
      assert.equal(normalizeNigerianPhone(phoneForField(stored)), "+2348031234567", stored);
    }
  });

  it("returns an unrecognised number unchanged, and nothing for none", () => {
    assert.equal(phoneForField("+447911123456"), "+447911123456");
    assert.equal(phoneForField(null), "");
    assert.equal(phoneForField(undefined), "");
  });
});

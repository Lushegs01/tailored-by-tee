import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  EMPTY_CHECKOUT_FORM,
  getCheckoutSessionId,
  loadCheckoutDraft,
  saveCheckoutDraft,
  type CheckoutFormState,
} from "./checkout-draft";

class MemoryStorage {
  private readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

// Node has no window; the draft only needs its sessionStorage.
const host = globalThis as unknown as { window?: { sessionStorage: MemoryStorage } };
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  host.window = { sessionStorage: storage };
});

afterEach(() => {
  delete host.window;
});

const typed: CheckoutFormState = {
  ...EMPTY_CHECKOUT_FORM,
  fullName: "Adaeze Okafor",
  email: "adaeze@example.com",
  phone: "+234 803 123 4567",
  line1: "14 Admiralty Way",
  city: "Lagos",
  state: "LA",
};

describe("checkout draft ownership", () => {
  it("keeps a guest's draft for the guest", () => {
    saveCheckoutDraft(typed, null);
    assert.deepEqual(loadCheckoutDraft(null), typed);
  });

  it("carries a guest's draft into a sign-in", () => {
    saveCheckoutDraft(typed, null);
    assert.deepEqual(loadCheckoutDraft("adaeze@example.com"), typed);
  });

  it("keeps an account's draft for that account", () => {
    saveCheckoutDraft(typed, "adaeze@example.com");
    assert.deepEqual(loadCheckoutDraft("adaeze@example.com"), typed);
  });

  it("drops an account's draft once signed out, with its checkout session", () => {
    saveCheckoutDraft(typed, "adaeze@example.com");
    const session = getCheckoutSessionId();

    assert.deepEqual(loadCheckoutDraft(null), EMPTY_CHECKOUT_FORM);
    assert.equal(storage.getItem("tbt.checkout.draft.v1"), null);
    assert.notEqual(getCheckoutSessionId(), session);
  });

  it("drops an account's draft for a different account", () => {
    saveCheckoutDraft(typed, "adaeze@example.com");
    assert.deepEqual(loadCheckoutDraft("tunde@example.com"), EMPTY_CHECKOUT_FORM);
  });

  it("reads a draft saved before owners were recorded as a guest's", () => {
    storage.setItem("tbt.checkout.draft.v1", JSON.stringify(typed));
    assert.deepEqual(loadCheckoutDraft(null), typed);
  });

  it("starts empty without storage", () => {
    delete host.window;
    assert.deepEqual(loadCheckoutDraft(null), EMPTY_CHECKOUT_FORM);
  });
});

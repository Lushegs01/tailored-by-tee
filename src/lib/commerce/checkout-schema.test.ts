import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkoutDetailsSchema, checkoutFieldErrors, checkoutLinesSchema } from "./checkout-schema";

const delivery = {
  email: "  Ada.Obi@Example.com ",
  phone: "0803 123 4567",
  fullName: "Ada Obi",
  deliveryMethod: "delivery" as const,
  line1: "12 Admiralty Way",
  city: "Lekki",
  state: "LA",
};

describe("checkoutDetailsSchema", () => {
  it("normalises email and phone", () => {
    const result = checkoutDetailsSchema.parse(delivery);
    assert.equal(result.email, "ada.obi@example.com");
    assert.equal(result.phone, "+2348031234567");
    assert.equal(result.newsletter, false);
  });

  it("does not ask for an address when collecting from the studio", () => {
    const result = checkoutDetailsSchema.safeParse({
      email: delivery.email,
      phone: delivery.phone,
      fullName: delivery.fullName,
      deliveryMethod: "pickup",
    });
    assert.equal(result.success, true);
  });

  it("requires street, city and a real state for delivery", () => {
    const result = checkoutDetailsSchema.safeParse({ ...delivery, line1: "", city: "", state: "XX" });
    assert.equal(result.success, false);
    const errors = result.success ? {} : checkoutFieldErrors(result.error);
    assert.ok(errors.line1);
    assert.ok(errors.city);
    assert.ok(errors.state);
  });

  it("explains a bad phone number and postal code", () => {
    const result = checkoutDetailsSchema.safeParse({ ...delivery, phone: "12345", postalCode: "1000" });
    const errors = result.success ? {} : checkoutFieldErrors(result.error);
    assert.match(errors.phone ?? "", /Nigerian mobile/);
    assert.match(errors.postalCode ?? "", /six digits/);
  });
});

describe("checkoutLinesSchema", () => {
  it("rejects an empty bag, zero and negative quantities", () => {
    assert.equal(checkoutLinesSchema.safeParse([]).success, false);
    assert.equal(checkoutLinesSchema.safeParse([{ variantId: "v", quantity: 0 }]).success, false);
    assert.equal(checkoutLinesSchema.safeParse([{ variantId: "v", quantity: -2 }]).success, false);
  });

  it("refuses lines carrying anything but a variant and a quantity (e.g. a price)", () => {
    assert.equal(checkoutLinesSchema.safeParse([{ variantId: "v", quantity: 1, price: 1 }]).success, false);
  });
});

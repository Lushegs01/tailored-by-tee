import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deliveryPolicy } from "@/config/policies";

import {
  actorName,
  addressLines,
  deliveryLabel,
  deliveryZoneName,
  paymentChannelLabel,
  phoneForDisplay,
  phoneHref,
  piecesSummary,
} from "./order-copy";

/*
 * The orders pages' wording and small conversions. Every one of these turns
 * something stored — a zone id, a Paystack channel name, a raw phone number, a
 * missing actor — into words the owner reads, so each is checked against what the
 * database actually holds rather than against a tidy example.
 */

const ZONE = deliveryPolicy.zones[0];

describe("deliveryZoneName", () => {
  it("names a zone the shop offers", () => {
    assert.equal(deliveryZoneName(ZONE.id), ZONE.name);
  });

  it("is nothing when no zone was recorded", () => {
    assert.equal(deliveryZoneName(null), null);
  });

  it("shows a retired zone's id rather than hiding the fact", () => {
    // An order placed under a zone since removed from the config must still say
    // something, or its delivery reads as a blank.
    assert.equal(deliveryZoneName("zone-we-no-longer-offer"), "zone-we-no-longer-offer");
  });
});

describe("deliveryLabel", () => {
  it("names the zone for a delivery", () => {
    assert.equal(deliveryLabel("DELIVERY", ZONE.id), `Delivery — ${ZONE.name}`);
  });

  it("falls back to plain delivery when no zone was recorded", () => {
    assert.equal(deliveryLabel("DELIVERY", null), "Delivery");
  });

  it("never says “delivery” about a collection, whatever zone is stored", () => {
    const expected = deliveryPolicy.pickup?.name ?? "Collect from the studio";
    assert.equal(deliveryLabel("PICKUP", null), expected);
    assert.equal(deliveryLabel("PICKUP", ZONE.id), expected);
  });
});

describe("addressLines", () => {
  const address = {
    fullName: "Ada Obi",
    line1: "12 Bourdillon Road",
    line2: null,
    city: "Ikoyi",
    state: "LA",
    postalCode: "101233",
  };

  it("spells the state out and drops the lines that are missing", () => {
    assert.deepEqual(addressLines("DELIVERY", address), [
      "Ada Obi",
      "12 Bourdillon Road",
      "Ikoyi, Lagos",
      "101233",
    ]);
  });

  it("keeps a second line when there is one", () => {
    assert.ok(addressLines("DELIVERY", { ...address, line2: "Flat 4" }).includes("Flat 4"));
  });

  it("keeps an unrecognised state code rather than losing it", () => {
    assert.ok(addressLines("DELIVERY", { ...address, state: "ZZ" }).includes("Ikoyi, ZZ"));
  });

  it("drops a line that is only spaces", () => {
    assert.equal(addressLines("DELIVERY", { ...address, line1: "   " }).includes("   "), false);
  });

  it("gives the studio's address for a collection, not the customer's", () => {
    const lines = addressLines("PICKUP", address);
    assert.equal(lines.includes("12 Bourdillon Road"), false);
    assert.deepEqual(lines, deliveryPolicy.pickup?.address ? [deliveryPolicy.pickup.address] : []);
  });

  it("is empty rather than broken when nothing was recorded", () => {
    assert.deepEqual(
      addressLines("DELIVERY", {
        fullName: null,
        line1: null,
        line2: null,
        city: null,
        state: null,
        postalCode: null,
      }),
      [],
    );
  });
});

describe("phoneForDisplay", () => {
  it("spaces a Nigerian mobile out", () => {
    assert.equal(phoneForDisplay("+2348031234567"), "+234 803 123 4567");
  });

  it("reads a number typed the local way", () => {
    assert.equal(phoneForDisplay("08031234567"), "+234 803 123 4567");
  });

  it("shows anything else as it was stored", () => {
    assert.equal(phoneForDisplay("+44 20 7946 0000"), "+44 20 7946 0000");
  });

  it("is nothing when there is no number", () => {
    assert.equal(phoneForDisplay(null), null);
    assert.equal(phoneForDisplay(undefined), null);
    assert.equal(phoneForDisplay("   "), null);
  });
});

describe("phoneHref", () => {
  it("dials the E.164 form, without the display spacing", () => {
    assert.equal(phoneHref("+234 803 123 4567"), "tel:+2348031234567");
    assert.equal(phoneHref("08031234567"), "tel:+2348031234567");
  });

  it("strips the spacing from a number it can't read, rather than dropping the link", () => {
    assert.equal(phoneHref("+44 20 7946 0000"), "tel:+442079460000");
  });

  it("is nothing when there is no number", () => {
    assert.equal(phoneHref(null), null);
    assert.equal(phoneHref("  "), null);
  });
});

describe("actorName", () => {
  it("prefers the admin's name", () => {
    assert.equal(actorName({ name: "Tolu", email: "tolu@example.com" }), "Tolu");
  });

  it("falls back to their email when they haven't given a name", () => {
    assert.equal(actorName({ name: null, email: "tolu@example.com" }), "tolu@example.com");
    assert.equal(actorName({ name: "  ", email: "tolu@example.com" }), "tolu@example.com");
  });

  it("names the shop, Paystack and the scheduled jobs for what they are", () => {
    // These entries have no actor: the customer's own checkout, a webhook or the
    // hold sweep wrote them. "—" would read as missing data.
    assert.equal(actorName(null), "Outside the admin area");
    assert.equal(actorName(undefined), "Outside the admin area");
  });
});

describe("paymentChannelLabel", () => {
  it("says how the customer paid in plain words", () => {
    assert.equal(paymentChannelLabel("card"), "Card");
    assert.equal(paymentChannelLabel("bank_transfer"), "Bank transfer");
    assert.equal(paymentChannelLabel("ussd"), "USSD");
  });

  it("makes a channel it hasn't met readable rather than raw", () => {
    assert.equal(paymentChannelLabel("pay_with_transfer"), "pay with transfer");
  });

  it("is nothing when Paystack didn't say", () => {
    assert.equal(paymentChannelLabel(null), null);
  });
});

describe("piecesSummary", () => {
  it("counts one piece as one", () => {
    assert.equal(piecesSummary(1, 1), "1 piece");
  });

  it("leaves the line count out when every line is a single piece", () => {
    assert.equal(piecesSummary(3, 3), "3 pieces");
  });

  it("says how the pieces are spread when they aren't one each", () => {
    assert.equal(piecesSummary(2, 5), "5 pieces across 2 lines");
    assert.equal(piecesSummary(1, 4), "4 pieces across 1 line");
  });
});

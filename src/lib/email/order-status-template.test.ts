import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { siteConfig } from "@/config/site";

import {
  ORDER_STATUS_EMAIL_KINDS,
  renderOrderStatusEmail,
  statusEmailKind,
  type OrderStatusEmailKind,
  type StatusEmailOrder,
} from "./order-status-template";

function order(overrides: Partial<StatusEmailOrder> = {}): StatusEmailOrder {
  return {
    kind: "shipped",
    number: "ORD-2026-000012",
    customerName: "Ada Obi",
    items: [{ name: "Knitted Polo", colorName: "Sand", sizeLabel: "M", quantity: 2 }],
    deliveryLabel: "Lagos",
    deliveryEstimate: "1–2 working days",
    addressLines: ["Ada Obi", "12 Admiralty Way", "Lekki, Lagos"],
    carrier: "GIG Logistics",
    trackingNumber: "GIG-88213",
    ...overrides,
  };
}

describe("statusEmailKind", () => {
  it("never tells a collection customer their order shipped", () => {
    assert.equal(statusEmailKind("SHIPPED", "DELIVERY"), "shipped");
    assert.equal(statusEmailKind("SHIPPED", "PICKUP"), "ready_for_collection");
    assert.equal(statusEmailKind("DELIVERED", "DELIVERY"), "delivered");
    assert.equal(statusEmailKind("DELIVERED", "PICKUP"), "collected");
  });
});

describe("renderOrderStatusEmail", () => {
  it("renders every kind with a subject, HTML and plain text", () => {
    for (const kind of ORDER_STATUS_EMAIL_KINDS) {
      const email = renderOrderStatusEmail(order({ kind }));
      assert.ok(email.subject.includes("ORD-2026-000012"), kind);
      assert.ok(email.subject.endsWith(siteConfig.name), kind);
      assert.ok(email.html.startsWith("<!doctype html>"), kind);
      assert.ok(email.text.length > 80, kind);
      assert.ok(email.html.includes("ORD-2026-000012"), kind);
      assert.ok(email.text.includes("ORD-2026-000012"), kind);
    }
  });

  it("links to the order in the customer's account", () => {
    const email = renderOrderStatusEmail(order());
    const expected = `${siteConfig.url.replace(/\/+$/, "")}/account/orders/ORD-2026-000012`;
    assert.ok(email.html.includes(expected));
    assert.ok(email.text.includes(expected));
  });

  it("greets by first name, and copes without one", () => {
    assert.ok(renderOrderStatusEmail(order()).html.includes("Ada"));
    const anonymous = renderOrderStatusEmail(order({ customerName: "" }));
    assert.ok(anonymous.html.includes("It’s on its way."));
    assert.equal(anonymous.html.includes("undefined"), false);
  });

  it("shows tracking on a shipped order only", () => {
    const shipped = renderOrderStatusEmail(order());
    assert.ok(shipped.html.includes("GIG-88213"));
    assert.ok(shipped.html.includes("GIG Logistics"));
    assert.ok(shipped.text.includes("Tracking number: GIG-88213"));

    const delivered = renderOrderStatusEmail(order({ kind: "delivered" }));
    assert.equal(delivered.html.includes("GIG-88213"), false);
  });

  it("leaves out the tracking block when there is none", () => {
    const email = renderOrderStatusEmail(order({ carrier: null, trackingNumber: null }));
    assert.equal(email.html.includes("Tracking"), false);
    assert.equal(email.text.includes("TRACKING"), false);
  });

  it("shows a courier without a reference, and a reference without a courier", () => {
    const courierOnly = renderOrderStatusEmail(order({ trackingNumber: null }));
    assert.ok(courierOnly.html.includes("GIG Logistics"));
    assert.equal(courierOnly.html.includes("Tracking number"), false);

    const referenceOnly = renderOrderStatusEmail(order({ carrier: null }));
    assert.ok(referenceOnly.html.includes("GIG-88213"));
    assert.equal(referenceOnly.html.includes("Courier"), false);
  });

  it("uses the promised window when there is one", () => {
    assert.ok(renderOrderStatusEmail(order()).html.includes("1–2 working days"));
    const noEstimate = renderOrderStatusEmail(order({ deliveryEstimate: null }));
    assert.ok(noEstimate.html.includes("We’ll let you know if anything changes."));
  });

  it("gives collection its own words and the studio's hours", () => {
    const ready = renderOrderStatusEmail(
      order({ kind: "ready_for_collection", deliveryLabel: "Collect from the studio", carrier: null, trackingNumber: null }),
    );
    assert.ok(ready.subject.includes("ready to collect"));
    assert.ok(ready.html.includes(siteConfig.contact.hours.replace(/&/g, "&amp;")));
    assert.equal(/ship/i.test(ready.subject), false);

    const collected = renderOrderStatusEmail(order({ kind: "collected" }));
    assert.equal(/deliver/i.test(collected.subject), false);
    assert.ok(collected.text.includes("collected from the studio"));
  });

  it("lists the pieces, and copes with an order that has none left", () => {
    const email = renderOrderStatusEmail(order());
    assert.ok(email.html.includes("Knitted Polo"));
    assert.ok(email.html.includes("Sand · M · Qty 2"));
    assert.ok(email.text.includes("Knitted Polo — Sand · M · Qty 2"));

    const empty = renderOrderStatusEmail(order({ items: [] }));
    assert.equal(empty.html.includes("Your pieces"), false);
    assert.ok(empty.subject.length > 0);
  });

  it("escapes everything a person could have typed", () => {
    const email = renderOrderStatusEmail(
      order({
        customerName: '<script>alert("x")</script>',
        carrier: "<b>Courier</b>",
        trackingNumber: "A&B\"'<>",
        deliveryLabel: "<img src=x onerror=1>",
        addressLines: ["<i>12 Admiralty</i>"],
        items: [{ name: "<em>Polo</em>", colorName: "S&nd", sizeLabel: '"M"', quantity: 1 }],
      }),
    );
    assert.equal(email.html.includes("<script>"), false);
    assert.equal(email.html.includes("<img src=x"), false);
    assert.equal(email.html.includes("<em>Polo</em>"), false);
    assert.equal(email.html.includes("<i>12 Admiralty"), false);
    assert.equal(email.html.includes("<b>Courier</b>"), false);
    assert.ok(email.html.includes("&lt;script&gt;"));
    assert.ok(email.html.includes("S&amp;nd"));
  });

  it("shows the address it has, and copes with none", () => {
    const email = renderOrderStatusEmail(order());
    assert.ok(email.html.includes("12 Admiralty Way"));
    const bare = renderOrderStatusEmail(order({ addressLines: [] }));
    assert.ok(bare.html.includes("Lagos"));
    assert.equal(bare.html.includes("undefined"), false);
  });

  it("gives every kind a different subject", () => {
    const subjects = new Set(
      ORDER_STATUS_EMAIL_KINDS.map((kind: OrderStatusEmailKind) => renderOrderStatusEmail(order({ kind })).subject),
    );
    assert.equal(subjects.size, ORDER_STATUS_EMAIL_KINDS.length);
  });

  it("always offers a way to get in touch", () => {
    for (const kind of ORDER_STATUS_EMAIL_KINDS) {
      const email = renderOrderStatusEmail(order({ kind }));
      assert.ok(email.text.includes(siteConfig.contact.email), kind);
      assert.ok(email.text.includes(siteConfig.contact.phone), kind);
    }
  });
});

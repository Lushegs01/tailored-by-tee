import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { siteConfig } from "@/config/site";
import { formatPrice } from "@/lib/format";

import {
  orderPageUrl,
  renderOrderConfirmationEmail,
  tidy,
  tidyOptional,
  type ConfirmationEmailOrder,
} from "./order-confirmation-template";

/** Invisible characters are built from code points so this file's source stays plain text. */
const char = (code: number) => String.fromCodePoint(code);
const NUL = char(0x00);
const TAB = char(0x09);
const LF = char(0x0a);
const CR = char(0x0d);
const DEL = char(0x7f);
const NEXT_LINE = char(0x85);
const RIGHT_TO_LEFT_OVERRIDE = char(0x202e);
const LEFT_TO_RIGHT_ISOLATE = char(0x2066);

function order(overrides: Partial<ConfirmationEmailOrder> = {}): ConfirmationEmailOrder {
  return {
    number: "ORD-2026-001284",
    email: "ada@example.com",
    customerName: "Ada Obi",
    items: [
      { name: "Linen Shirt", colorName: "Sand", sizeLabel: "M", quantity: 2, lineTotal: 90_000_00 },
      { name: "Wide Trouser", colorName: "Ink", sizeLabel: "L", quantity: 1, lineTotal: 65_000_00 },
    ],
    totals: { subtotal: 155_000_00, discountTotal: 0, shippingTotal: 5_000_00, total: 160_000_00 },
    couponCode: null,
    delivery: {
      method: "delivery",
      label: "Lagos Island",
      estimate: "1–2 working days",
      addressLines: ["Ada Obi", "12 Admiralty Way", "Lekki, Lagos"],
      notes: null,
    },
    isTestPayment: false,
    ...overrides,
  };
}

describe("renderOrderConfirmationEmail", () => {
  it("names the order in the subject and links to it in the account", () => {
    const email = renderOrderConfirmationEmail(order());
    assert.equal(email.subject, `Order ORD-2026-001284 confirmed — ${siteConfig.name}`);
    assert.equal(orderPageUrl("ORD-2026-001284"), `${siteConfig.url.replace(/\/+$/, "")}/account/orders/ORD-2026-001284`);
    assert.ok(email.html.includes(`href="${orderPageUrl("ORD-2026-001284")}"`));
    assert.ok(email.text.includes(`View your order: ${orderPageUrl("ORD-2026-001284")}`));
  });

  it("greets by first name, or plainly without one", () => {
    assert.ok(renderOrderConfirmationEmail(order()).text.startsWith("Thank you, Ada."));
    assert.ok(renderOrderConfirmationEmail(order({ customerName: "" })).text.startsWith(`Thank you.${LF}`));
  });

  it("lists pieces and totals, with the discount only when there is one", () => {
    const plain = renderOrderConfirmationEmail(order()).text;
    assert.ok(plain.includes(`Linen Shirt — ${formatPrice(90_000_00)}`));
    assert.ok(plain.includes("Sand · M · Qty 2"));
    assert.ok(plain.includes(`Delivery: ${formatPrice(5_000_00)}`));
    assert.ok(plain.includes(`Total: ${formatPrice(160_000_00)}`));
    assert.ok(!plain.includes("Discount"));

    const discounted = renderOrderConfirmationEmail(
      order({ couponCode: "WELCOME10", totals: { subtotal: 155_000_00, discountTotal: 15_500_00, shippingTotal: 0, total: 139_500_00 } }),
    ).text;
    assert.ok(discounted.includes(`Discount (WELCOME10): −${formatPrice(15_500_00)}`));
    assert.ok(discounted.includes("Delivery: Free"));
  });

  it("says Collection for pickup orders", () => {
    const email = renderOrderConfirmationEmail(
      order({
        totals: { subtotal: 155_000_00, discountTotal: 0, shippingTotal: 0, total: 155_000_00 },
        delivery: { method: "pickup", label: "The studio", estimate: null, addressLines: ["Studio 4, Lekki"], notes: null },
      }),
    );
    assert.ok(email.text.includes("Collection: Free"));
    assert.ok(email.text.includes("COLLECTION"));
    assert.ok(email.text.includes("ready to collect"));
  });

  it("marks test payments, and only test payments", () => {
    assert.ok(renderOrderConfirmationEmail(order({ isTestPayment: true })).html.includes("Test payment — no money moved"));
    assert.ok(!renderOrderConfirmationEmail(order()).html.includes("Test payment"));
  });

  it("escapes every customer- and staff-typed value in the HTML", () => {
    const email = renderOrderConfirmationEmail(
      order({
        customerName: `<script>alert("x")</script> Obi`,
        email: `ada"@example.com`,
        items: [{ name: `"><img src=x onerror=alert(1)>`, colorName: "<b>Sand</b>", sizeLabel: "M", quantity: 1, lineTotal: 1_000_00 }],
        couponCode: "<i>CODE</i>",
        totals: { subtotal: 1_000_00, discountTotal: 100_00, shippingTotal: 0, total: 900_00 },
        delivery: {
          method: "delivery",
          label: "Lagos",
          estimate: null,
          addressLines: ["12 Road<br>Lekki"],
          notes: `</table><a href="javascript:alert(1)">x</a>`,
        },
      }),
    );

    assert.ok(!/<script/i.test(email.html));
    assert.ok(!/<img/i.test(email.html));
    assert.ok(!/<b>|<i>/.test(email.html));
    assert.ok(!email.html.includes('href="javascript:'));
    assert.ok(!email.html.includes("12 Road<br>Lekki"));
    // Only the button and the help line's mailto are links.
    assert.equal(email.html.match(/<a\s/g)?.length, 2);
    assert.ok(email.html.includes("&lt;script&gt;"));
    assert.ok(email.html.includes("ada&quot;@example.com"));
  });

  it("keeps the plain-text version free of HTML entities", () => {
    const email = renderOrderConfirmationEmail(order({ customerName: "Ada & Co", delivery: { ...order().delivery, notes: "Gate <B>" } }));
    assert.ok(email.text.includes("Gate <B>"));
    assert.ok(!/&(amp|lt|gt|quot|#39);/.test(email.text));
  });
});

describe("tidy", () => {
  it("drops control and bidi-override characters and collapses whitespace", () => {
    assert.equal(tidy(`  Ada${CR}${LF}${TAB}Obi${RIGHT_TO_LEFT_OVERRIDE}evil${LEFT_TO_RIGHT_ISOLATE}  `), "Ada Obievil");
    assert.equal(tidy(`a${NUL}b${DEL}c${NEXT_LINE}d`), "a b c d");
  });

  it("reads an empty result as absent", () => {
    assert.equal(tidyOptional(null), null);
    assert.equal(tidyOptional(` ${LF} `), null);
    assert.equal(tidyOptional(" Lekki "), "Lekki");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseListParams } from "@/lib/admin/pagination";

import {
  CUSTOMER_LIST_ALLOWED,
  CUSTOMERS_PATH,
  GUEST_CUSTOMER_PATH,
  MAX_EMAIL_LENGTH,
  accountDisplay,
  customerHref,
  customerName,
  customerOrdersHref,
  customerPath,
  customerTotalFor,
  guestCustomerHref,
  hasCustomerFilters,
  isCustomerId,
  normaliseCustomerEmail,
  phoneSearchDigits,
  SETTINGS_SERVICES_HREF,
  SETTINGS_TEAM_HREF,
  summaryScopeNote,
  toCustomerListQuery,
  type CustomerCounts,
} from "./customer-rules";

describe("normaliseCustomerEmail", () => {
  it("trims and lower-cases a real address", () => {
    assert.equal(normaliseCustomerEmail("  Ada@Example.COM "), "ada@example.com");
  });

  it("accepts the shapes checkout stores", () => {
    assert.equal(normaliseCustomerEmail("ada.obi+shop@mail.co.uk"), "ada.obi+shop@mail.co.uk");
    assert.equal(normaliseCustomerEmail("a@b.ng"), "a@b.ng");
  });

  it("refuses anything that isn't an address", () => {
    for (const value of ["", "   ", "ada", "ada@", "@example.com", "ada@example", "ada example@mail.com", "a@b@c.com"]) {
      assert.equal(normaliseCustomerEmail(value), null, `expected ${JSON.stringify(value)} to be refused`);
    }
  });

  it("refuses non-strings and absurdly long values", () => {
    assert.equal(normaliseCustomerEmail(undefined), null);
    assert.equal(normaliseCustomerEmail(42), null);
    assert.equal(normaliseCustomerEmail(["ada@example.com"]), null);
    assert.equal(normaliseCustomerEmail(`${"a".repeat(MAX_EMAIL_LENGTH)}@example.com`), null);
  });
});

describe("links", () => {
  it("sends a registered customer to their account page", () => {
    assert.equal(customerHref({ userId: "usr_1", email: "ada@example.com" }), `${CUSTOMERS_PATH}/usr_1`);
  });

  it("sends a guest to the view keyed by their address", () => {
    assert.equal(
      customerHref({ userId: null, email: "ada+guest@example.com" }),
      `${GUEST_CUSTOMER_PATH}?email=ada%2Bguest%40example.com`,
    );
  });

  it("escapes ids and addresses", () => {
    assert.equal(customerPath("a/b?c"), `${CUSTOMERS_PATH}/a%2Fb%3Fc`);
    assert.equal(guestCustomerHref("a b@x.com"), `${GUEST_CUSTOMER_PATH}?email=a%20b%40x.com`);
    assert.equal(customerOrdersHref("ada+1@example.com"), "/admin/orders?q=ada%2B1%40example.com");
  });

  // These anchors are Settings' own section ids (INTEGRATIONS_SECTION_ID and
  // ADMIN_TEAM_SECTION_ID). If that page renames one, these have to follow.
  it("points at sections Settings actually has", () => {
    assert.equal(SETTINGS_SERVICES_HREF, "/admin/settings#services");
    assert.equal(SETTINGS_TEAM_HREF, "/admin/settings#admin-team");
  });
});

describe("isCustomerId", () => {
  it("accepts the ids this database issues", () => {
    assert.equal(isCustomerId("clx8k2p9f0000abcd1234efgh"), true);
    assert.equal(isCustomerId("demo_user_ada"), true);
  });

  it("refuses anything that could never be one", () => {
    for (const value of ["", "a/b", "a b", "../secret", "a%20b", "ada@example.com", "a".repeat(192)]) {
      assert.equal(isCustomerId(value), false, `expected ${JSON.stringify(value)} to be refused`);
    }
  });
});

describe("toCustomerListQuery", () => {
  const parse = (search: Record<string, string>) =>
    toCustomerListQuery(parseListParams(search, CUSTOMER_LIST_ALLOWED));

  it("defaults to the most recent buyers first", () => {
    assert.deepEqual(parse({}), {
      page: 1,
      q: "",
      sort: "lastOrder",
      dir: "desc",
      account: null,
      orders: null,
    });
  });

  it("keeps allowed filters and sorts", () => {
    const query = parse({ q: " Ada ", account: "guest", orders: "with", sort: "spent", dir: "asc", page: "3" });
    assert.equal(query.q, "Ada");
    assert.equal(query.account, "guest");
    assert.equal(query.orders, "with");
    assert.equal(query.sort, "spent");
    assert.equal(query.dir, "asc");
    assert.equal(query.page, 3);
  });

  it("ignores values that aren't on the allow-list", () => {
    const query = parse({ account: "vip", orders: "maybe", sort: "password" });
    assert.equal(query.account, null);
    assert.equal(query.orders, null);
    assert.equal(query.sort, "lastOrder");
  });

  it("knows when the list is narrowed", () => {
    assert.equal(hasCustomerFilters(parse({})), false);
    assert.equal(hasCustomerFilters(parse({ q: "ada" })), true);
    assert.equal(hasCustomerFilters(parse({ account: "registered" })), true);
    assert.equal(hasCustomerFilters(parse({ orders: "without" })), true);
  });
});

describe("customerTotalFor", () => {
  // 10 customers: 6 accounts (4 of which have ordered) and 4 guests, who by
  // definition have all ordered. So 8 have ordered and 2 never have.
  const counts: CustomerCounts = { total: 10, registered: 6, registeredWithOrders: 4, withOrders: 8 };

  it("counts every combination of the two filters", () => {
    assert.equal(customerTotalFor(counts, { account: null, orders: null }), 10);
    assert.equal(customerTotalFor(counts, { account: "registered", orders: null }), 6);
    assert.equal(customerTotalFor(counts, { account: "guest", orders: null }), 4);
    assert.equal(customerTotalFor(counts, { account: null, orders: "with" }), 8);
    assert.equal(customerTotalFor(counts, { account: null, orders: "without" }), 2);
    assert.equal(customerTotalFor(counts, { account: "registered", orders: "with" }), 4);
    assert.equal(customerTotalFor(counts, { account: "registered", orders: "without" }), 2);
    assert.equal(customerTotalFor(counts, { account: "guest", orders: "with" }), 4);
  });

  it("knows a guest who has never ordered cannot exist", () => {
    assert.equal(customerTotalFor(counts, { account: "guest", orders: "without" }), 0);
  });

  it("never returns a negative or impossible count", () => {
    const nonsense: CustomerCounts = { total: 2, registered: 9, registeredWithOrders: 9, withOrders: 9 };
    for (const account of [null, "registered", "guest"] as const) {
      for (const orders of [null, "with", "without"] as const) {
        const total = customerTotalFor(nonsense, { account, orders });
        assert.ok(total >= 0 && total <= 2, `expected 0…2, got ${total}`);
      }
    }
  });

  it("handles an empty shop", () => {
    const empty: CustomerCounts = { total: 0, registered: 0, registeredWithOrders: 0, withOrders: 0 };
    assert.equal(customerTotalFor(empty, { account: null, orders: null }), 0);
    assert.equal(customerTotalFor(empty, { account: "guest", orders: "with" }), 0);
  });
});

describe("phoneSearchDigits", () => {
  it("reduces every way a Nigerian number is typed to the same national digits", () => {
    for (const typed of ["08031234567", "0803 123 4567", "+2348031234567", "+234 803 123 4567", "2348031234567", "8031234567", "(0803) 123-4567"]) {
      assert.equal(phoneSearchDigits(typed), "8031234567", `for ${typed}`);
    }
  });

  it("accepts a partial number", () => {
    assert.equal(phoneSearchDigits("0803 123"), "803123");
    assert.equal(phoneSearchDigits("1234"), "1234");
  });

  it("ignores text that isn't a number", () => {
    assert.equal(phoneSearchDigits("ada@example.com"), null);
    assert.equal(phoneSearchDigits("Ada Obi"), null);
    assert.equal(phoneSearchDigits("ORD-2026-000123"), null);
    assert.equal(phoneSearchDigits(""), null);
    assert.equal(phoneSearchDigits("   "), null);
  });

  it("ignores a number too short to narrow anything down", () => {
    assert.equal(phoneSearchDigits("080"), null);
    assert.equal(phoneSearchDigits("0"), null);
    assert.equal(phoneSearchDigits("+234"), null);
  });
});

describe("words for the owner", () => {
  it("names the two kinds of customer", () => {
    assert.equal(accountDisplay(true).label, "Has an account");
    assert.equal(accountDisplay(false).label, "Guest");
    assert.equal(accountDisplay(false).tone, "neutral");
  });

  it("falls back to the email address when there is no name", () => {
    assert.equal(customerName({ name: "Ada Obi", email: "ada@example.com" }), "Ada Obi");
    assert.equal(customerName({ name: "   ", email: "ada@example.com" }), "ada@example.com");
    assert.equal(customerName({ name: null, email: "ada@example.com" }), "ada@example.com");
  });

  it("says the headline figures ignore the filters, but only when a filter is on", () => {
    assert.equal(summaryScopeNote({ account: null, orders: null }), null);
    assert.match(summaryScopeNote({ account: "guest", orders: null }) ?? "", /narrowed by the filters/);
    assert.match(summaryScopeNote({ account: null, orders: "with" }) ?? "", /everyone matching the search/);
  });
});

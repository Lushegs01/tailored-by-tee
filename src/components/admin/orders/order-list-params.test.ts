import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildListHref } from "@/lib/admin/pagination";

import {
  ORDER_LIST_ALLOWED,
  RANGE_FILTER_OPTIONS,
  SHOW_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  TO_FULFIL,
  describeOrderFilters,
  escapeLikePattern,
  hasOrderFilters,
  orderSearch,
  parseOrderListParams,
  rangeStart,
  startOfLagosDay,
  toOrderListQuery,
} from "./order-list-params";

const ORDERS_PATH = "/admin/orders";

function parse(search: string) {
  return parseOrderListParams(new URLSearchParams(search));
}

/** 14 Sep 2026, 09:30 in Lagos (08:30 UTC). */
const now = new Date("2026-09-14T08:30:00.000Z");

describe("parseOrderListParams", () => {
  it("defaults to the newest orders first, page 1, no filters", () => {
    const params = parse("");
    assert.equal(params.page, 1);
    assert.equal(params.q, "");
    assert.equal(params.sort, "placed");
    assert.equal(params.dir, "desc");
    assert.deepEqual(params.filters, {});
    assert.equal(hasOrderFilters(params), false);
  });

  it("keeps only values it recognises", () => {
    const params = parse("status=PAID&payment=SUCCESS&method=PICKUP&placed=7d&show=hide_test&sort=total&dir=asc&page=3");
    assert.deepEqual(params.filters, {
      status: "PAID",
      payment: "SUCCESS",
      method: "PICKUP",
      placed: "7d",
      show: "hide_test",
    });
    assert.equal(params.sort, "total");
    assert.equal(params.dir, "asc");
    assert.equal(params.page, 3);
  });

  it("ignores nonsense without throwing", () => {
    const params = parse("status=DROP+TABLE&payment=yes&method=TELEPORT&placed=ever&show=all&sort=email&dir=sideways&page=-4");
    assert.deepEqual(params.filters, {});
    assert.equal(params.sort, "placed");
    assert.equal(params.dir, "desc");
    assert.equal(params.page, 1);
  });

  it("offers the to-fulfil shortcut alongside every status", () => {
    assert.equal(STATUS_FILTER_OPTIONS[0].value, TO_FULFIL);
    assert.equal(STATUS_FILTER_OPTIONS.length, 8);
    const params = parse(`status=${TO_FULFIL}`);
    assert.equal(params.filters.status, TO_FULFIL);
    assert.deepEqual(toOrderListQuery(params, now).statuses, ["PAID", "PROCESSING"]);
  });

  it("round-trips through buildListHref", () => {
    const params = parse("status=PAID&q=ada");
    assert.equal(buildListHref(ORDERS_PATH, params), "/admin/orders?q=ada&status=PAID");
    assert.equal(buildListHref(ORDERS_PATH, params, { clear: true }), "/admin/orders");
    // A filter change goes back to page 1.
    const page3 = parse("status=PAID&page=3");
    assert.equal(buildListHref(ORDERS_PATH, page3, { filters: { status: "SHIPPED" } }), "/admin/orders?status=SHIPPED");
  });

  it("names every filter it parses in its allow-list", () => {
    assert.deepEqual([...ORDER_LIST_ALLOWED.filters], ["status", "payment", "method", "placed", "show"]);
    for (const name of ORDER_LIST_ALLOWED.filters) {
      assert.ok(name in ORDER_LIST_ALLOWED.filterValues, name);
    }
  });
});

describe("escapeLikePattern", () => {
  it("makes wildcards match themselves", () => {
    assert.equal(escapeLikePattern("a_b"), "a\\_b");
    assert.equal(escapeLikePattern("100%"), "100\\%");
    assert.equal(escapeLikePattern("back\\slash"), "back\\\\slash");
    assert.equal(escapeLikePattern("%_\\"), "\\%\\_\\\\");
  });

  it("leaves ordinary searches alone", () => {
    assert.equal(escapeLikePattern("ORD-2026-000012"), "ORD-2026-000012");
    assert.equal(escapeLikePattern("ada@example.com"), "ada@example.com");
    assert.equal(escapeLikePattern("O'Brien"), "O'Brien");
  });
});

describe("orderSearch", () => {
  it("is nothing for an empty search", () => {
    assert.equal(orderSearch(""), null);
    assert.equal(orderSearch("   "), null);
  });

  it("escapes the text and reads a phone number when there is one", () => {
    assert.deepEqual(orderSearch("0803 123 4567"), { text: "0803 123 4567", phone: "+2348031234567" });
    assert.deepEqual(orderSearch("+234 803 123 4567"), { text: "+234 803 123 4567", phone: "+2348031234567" });
    assert.deepEqual(orderSearch("ada%"), { text: "ada\\%", phone: null });
  });

  it("finds an order number typed in part", () => {
    assert.deepEqual(orderSearch("000012"), { text: "000012", phone: null });
  });
});

describe("Lagos days", () => {
  it("starts the day at midnight in Lagos, not UTC", () => {
    // 14 Sep 2026 00:00 Lagos is 13 Sep 2026 23:00 UTC.
    assert.equal(startOfLagosDay(now).toISOString(), "2026-09-13T23:00:00.000Z");
  });

  it("keeps late-evening UTC in the right Lagos day", () => {
    // 23:30 UTC on 14 Sep is already 00:30 on 15 Sep in Lagos.
    const lateUtc = new Date("2026-09-14T23:30:00.000Z");
    assert.equal(startOfLagosDay(lateUtc).toISOString(), "2026-09-14T23:00:00.000Z");
  });

  it("counts calendar days inclusive of today", () => {
    assert.equal(rangeStart("today", now)?.toISOString(), "2026-09-13T23:00:00.000Z");
    assert.equal(rangeStart("7d", now)?.toISOString(), "2026-09-07T23:00:00.000Z");
    assert.equal(rangeStart("30d", now)?.toISOString(), "2026-08-15T23:00:00.000Z");
    assert.equal(rangeStart("90d", now)?.toISOString(), "2026-06-16T23:00:00.000Z");
  });

  it("is nothing for an unknown range", () => {
    assert.equal(rangeStart("", now), null);
    assert.equal(rangeStart("all", now), null);
  });

  it("offers exactly the ranges it can parse", () => {
    for (const option of RANGE_FILTER_OPTIONS) assert.ok(rangeStart(option.value, now) instanceof Date, option.value);
  });
});

describe("toOrderListQuery", () => {
  it("asks for everything when nothing is filtered", () => {
    const query = toOrderListQuery(parse(""), now);
    assert.deepEqual(query.statuses, []);
    assert.equal(query.paymentStatus, null);
    assert.equal(query.deliveryMethod, null);
    assert.equal(query.placedFrom, null);
    assert.equal(query.isTest, null);
    assert.equal(query.isDemo, null);
    assert.equal(query.search, null);
    assert.equal(query.sort, "placed");
    assert.equal(query.dir, "desc");
  });

  it("shows test and demo orders unless the owner says otherwise", () => {
    assert.equal(toOrderListQuery(parse(""), now).isTest, null);
    assert.equal(toOrderListQuery(parse(""), now).isDemo, null);
    assert.equal(toOrderListQuery(parse("show=hide_test"), now).isTest, false);
    assert.equal(toOrderListQuery(parse("show=only_test"), now).isTest, true);
    assert.equal(toOrderListQuery(parse("show=hide_demo"), now).isDemo, false);
    assert.equal(toOrderListQuery(parse("show=only_demo"), now).isDemo, true);
    // The two are one select, so choosing a demo option leaves test payments alone.
    assert.equal(toOrderListQuery(parse("show=only_demo"), now).isTest, null);
  });

  it("turns one status into a one-item list", () => {
    assert.deepEqual(toOrderListQuery(parse("status=SHIPPED"), now).statuses, ["SHIPPED"]);
    assert.deepEqual(toOrderListQuery(parse("status=REFUNDED"), now).statuses, ["REFUNDED"]);
  });

  it("carries the other filters through", () => {
    const query = toOrderListQuery(parse("payment=FAILED&method=PICKUP&placed=today&q=Ada"), now);
    assert.equal(query.paymentStatus, "FAILED");
    assert.equal(query.deliveryMethod, "PICKUP");
    assert.equal(query.placedFrom?.toISOString(), "2026-09-13T23:00:00.000Z");
    assert.deepEqual(query.search, { text: "Ada", phone: null });
  });

  it("only sorts by a column it knows", () => {
    assert.equal(toOrderListQuery(parse("sort=total&dir=asc"), now).sort, "total");
    assert.equal(toOrderListQuery(parse("sort=customer"), now).sort, "placed");
  });
});

describe("describeOrderFilters", () => {
  it("says so when nothing is narrowed", () => {
    assert.equal(describeOrderFilters(parse("")), "all orders");
  });

  it("reads back what the owner chose", () => {
    assert.equal(describeOrderFilters(parse(`status=${TO_FULFIL}`)), "to fulfil");
    assert.equal(describeOrderFilters(parse("status=SHIPPED&method=PICKUP")), "shipped, collection");
    assert.equal(describeOrderFilters(parse("placed=7d&q=Ada")), "last 7 days, matching “Ada”");
    assert.equal(describeOrderFilters(parse("show=hide_test")), "hide test payments");
  });

  it("ignores values it doesn't recognise", () => {
    assert.equal(describeOrderFilters(parse("status=NONSENSE")), "all orders");
  });

  it("can describe every option it offers", () => {
    for (const option of [...STATUS_FILTER_OPTIONS, ...SHOW_FILTER_OPTIONS]) {
      assert.ok(option.label.length > 0, option.value);
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  changesDiscountAmount,
  describeDiscountChanges,
  describeDiscountDetails,
  describeDiscountRule,
  describePerCustomer,
  describeSchedule,
  describeUses,
  discountCodeProblem,
  discountDuplicateSchema,
  discountFormSchema,
  discountStatus,
  discountStatusDisplay,
  discountWarnings,
  normalizeDiscountCode,
  parseLagosDateTime,
  previewDiscount,
  suggestCopyCode,
  toLagosDateTimeInput,
  type DiscountSnapshot,
  type DiscountStatusInput,
} from "./discount-schema";
import { parseInput } from "./validation";

const now = new Date("2026-09-22T12:00:00Z");

/** A complete, valid form as the browser sends it. */
function form(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code: "welcome10",
    description: "",
    type: "PERCENTAGE",
    percentOff: "10",
    amountOff: "",
    minSubtotal: "",
    maxDiscount: "",
    startsAt: "",
    endsAt: "",
    usageLimit: "",
    perCustomerLimit: "",
    isActive: "on",
    ...overrides,
  };
}

function parse(overrides: Record<string, unknown> = {}, context: Parameters<typeof discountFormSchema>[0] = { now }) {
  return parseInput(discountFormSchema(context), form(overrides));
}

function errorsOf(result: ReturnType<typeof parse>): Record<string, string> {
  assert.equal(result.ok, false, "expected the form to be refused");
  return result.ok ? {} : result.fieldErrors;
}

function dataOf(result: ReturnType<typeof parse>) {
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.fieldErrors));
  if (!result.ok) throw new Error("unreachable");
  return result.data;
}

describe("discount codes", () => {
  it("normalises like checkout: no spaces, capitals", () => {
    assert.equal(normalizeDiscountCode(" summer sale 10 "), "SUMMERSALE10");
  });

  it("accepts 3 to 32 letters, numbers and single hyphens", () => {
    assert.equal(discountCodeProblem("ABC"), null);
    assert.equal(discountCodeProblem("A".repeat(32)), null);
    assert.equal(discountCodeProblem("EASTER-2027"), null);
    assert.match(discountCodeProblem("AB") ?? "", /at least 3/);
    assert.match(discountCodeProblem("A".repeat(33)) ?? "", /up to 32/);
    assert.match(discountCodeProblem("SUMMER_10") ?? "", /letters, numbers and hyphens/);
    assert.match(discountCodeProblem("-SALE") ?? "", /Start and end/);
    assert.match(discountCodeProblem("SALE-") ?? "", /Start and end/);
    assert.match(discountCodeProblem("A--B") ?? "", /one hyphen/);
    assert.match(discountCodeProblem("") ?? "", /Enter a code/);
  });

  it("suggests a copy's code within the length limit", () => {
    assert.equal(suggestCopyCode("welcome10"), "WELCOME10-COPY");
    const long = suggestCopyCode("A".repeat(32));
    assert.equal(long.length, 32);
    assert.ok(long.endsWith("-COPY"));
    assert.equal(discountCodeProblem(suggestCopyCode(`${"B".repeat(26)}-X`)), null);
  });
});

describe("Lagos date and time", () => {
  it("reads a datetime-local value as Lagos time (UTC+1)", () => {
    assert.equal(parseLagosDateTime("2026-10-01T09:00")?.toISOString(), "2026-10-01T08:00:00.000Z");
    assert.equal(parseLagosDateTime("2026-10-01T00:30:15")?.toISOString(), "2026-09-30T23:30:15.000Z");
  });

  it("refuses dates that don't exist or are out of range", () => {
    assert.equal(parseLagosDateTime("2026-02-30T10:00"), null);
    assert.equal(parseLagosDateTime("2026-13-01T10:00"), null);
    assert.equal(parseLagosDateTime("2026-10-01T24:00"), null);
    assert.equal(parseLagosDateTime("1999-12-31T23:59"), null);
    assert.equal(parseLagosDateTime("2026-10-01"), null);
    assert.equal(parseLagosDateTime("tomorrow"), null);
  });

  it("shows a stored instant as Lagos wall-clock time, across midnight", () => {
    assert.equal(toLagosDateTimeInput(new Date("2026-09-30T23:30:00Z")), "2026-10-01T00:30");
    assert.equal(toLagosDateTimeInput(null), "");
    assert.equal(toLagosDateTimeInput(parseLagosDateTime("2026-12-31T23:59")), "2026-12-31T23:59");
  });
});

describe("discountFormSchema", () => {
  it("reads a percentage code", () => {
    const data = dataOf(parse({ maxDiscount: "10,000", minSubtotal: "50,000", perCustomerLimit: "1", usageLimit: "100" }));
    assert.equal(data.code, "WELCOME10");
    assert.equal(data.type, "PERCENTAGE");
    assert.equal(data.value, 10);
    assert.equal(data.maxDiscount, 10_000_00);
    assert.equal(data.minSubtotal, 50_000_00);
    assert.equal(data.usageLimit, 100);
    assert.equal(data.perCustomerLimit, 1);
    assert.equal(data.isActive, true);
    assert.equal(data.description, null);
    assert.deepEqual(data.categoryIds, []);
  });

  it("keeps percentages whole and between 1 and 100", () => {
    assert.equal(dataOf(parse({ percentOff: "1" })).value, 1);
    assert.equal(dataOf(parse({ percentOff: "100" })).value, 100);
    assert.equal(dataOf(parse({ percentOff: "15%" })).value, 15);
    assert.match(errorsOf(parse({ percentOff: "0" })).percentOff, /at least 1%/);
    assert.match(errorsOf(parse({ percentOff: "101" })).percentOff, /more than 100%/);
    assert.match(errorsOf(parse({ percentOff: "12.5" })).percentOff, /whole percentage/);
    assert.match(errorsOf(parse({ percentOff: "" })).percentOff, /Enter the percentage/);
  });

  it("reads a fixed amount in whole naira, at least ₦1", () => {
    const data = dataOf(parse({ type: "FIXED", amountOff: "5,000", percentOff: "nonsense" }));
    assert.equal(data.value, 5_000_00);
    assert.equal(dataOf(parse({ type: "FIXED", amountOff: "1" })).value, 100);
    assert.match(errorsOf(parse({ type: "FIXED", amountOff: "5000.50" })).amountOff, /whole naira/);
    assert.match(errorsOf(parse({ type: "FIXED", amountOff: "0" })).amountOff, /at least ₦1/);
    assert.match(errorsOf(parse({ type: "FIXED", amountOff: "" })).amountOff, /Enter the amount off/);
  });

  it("ignores the other type's value and the cap on fixed amounts", () => {
    const fixed = dataOf(parse({ type: "FIXED", amountOff: "2,000", maxDiscount: "500" }));
    assert.equal(fixed.maxDiscount, null);
    const percent = dataOf(parse({ amountOff: "not money" }));
    assert.equal(percent.value, 10);
  });

  it("treats a blank or zero minimum as none", () => {
    assert.equal(dataOf(parse({ minSubtotal: "" })).minSubtotal, null);
    assert.equal(dataOf(parse({ minSubtotal: "0" })).minSubtotal, null);
    assert.match(errorsOf(parse({ minSubtotal: "49,999.50" })).minSubtotal, /whole naira/);
  });

  it("requires a type", () => {
    assert.match(errorsOf(parse({ type: "" })).type, /percentage or a fixed amount/);
    assert.match(errorsOf(parse({ type: "BOGOF" })).type, /percentage or a fixed amount/);
  });

  it("reads dates in Lagos time and keeps the end after the start", () => {
    const data = dataOf(parse({ startsAt: "2026-10-01T09:00", endsAt: "2026-10-31T23:59" }));
    assert.equal(data.startsAt?.toISOString(), "2026-10-01T08:00:00.000Z");
    assert.equal(data.endsAt?.toISOString(), "2026-10-31T22:59:00.000Z");

    assert.match(
      errorsOf(parse({ startsAt: "2026-10-31T09:00", endsAt: "2026-10-01T09:00" })).endsAt,
      /after the start/,
    );
    assert.match(
      errorsOf(parse({ startsAt: "2026-10-01T09:00", endsAt: "2026-10-01T09:00" })).endsAt,
      /after the start/,
    );
    assert.match(errorsOf(parse({ startsAt: "2026-02-30T09:00" })).startsAt, /date and time/);
  });

  it("refuses an end that has already passed, unless it's the stored one left as it was", () => {
    assert.match(errorsOf(parse({ endsAt: "2026-09-01T00:00" })).endsAt, /already passed/);

    const stored = new Date("2026-09-01T10:30:45Z");
    const current = { startsAt: null, endsAt: stored, usageCount: 4 };
    const kept = dataOf(parse({ endsAt: toLagosDateTimeInput(stored) }, { now, current }));
    assert.equal(kept.endsAt, stored, "the stored instant, seconds and all");

    assert.match(errorsOf(parse({ endsAt: "2026-09-02T00:00" }, { now, current })).endsAt, /already passed/);
  });

  it("won't set the total limit below the uses so far", () => {
    const current = { startsAt: null, endsAt: null, usageCount: 12 };
    assert.match(errorsOf(parse({ usageLimit: "11" }, { now, current })).usageLimit, /already been used 12 times/);
    assert.equal(dataOf(parse({ usageLimit: "12" }, { now, current })).usageLimit, 12);
    assert.match(errorsOf(parse({ usageLimit: "0" })).usageLimit, /1 or more/);
  });

  it("keeps the per-customer limit within the total", () => {
    assert.match(errorsOf(parse({ usageLimit: "5", perCustomerLimit: "6" })).perCustomerLimit, /more than the total/);
    assert.equal(dataOf(parse({ usageLimit: "5", perCustomerLimit: "5" })).perCustomerLimit, 5);
  });

  it("reads restrictions, dropping duplicates and refusing bad ids", () => {
    const data = dataOf(parse({ categoryIds: ["cat_shirts", "cat_shirts", "cat_knitwear"], productIds: "prod_knitted-polo" }));
    assert.deepEqual(data.categoryIds, ["cat_shirts", "cat_knitwear"]);
    assert.deepEqual(data.productIds, ["prod_knitted-polo"]);
    assert.match(errorsOf(parse({ productIds: ["prod ok?"] })).productIds, /out of date/);
  });

  it("reports every problem at once", () => {
    const errors = errorsOf(parse({ code: "x", percentOff: "150", usageLimit: "-1" }));
    assert.ok(errors.code);
    assert.ok(errors.percentOff);
    assert.ok(errors.usageLimit);
  });

  it("reads FormData from the form, with repeated restriction fields", () => {
    const data = new FormData();
    for (const [key, value] of Object.entries(form({ type: "FIXED", amountOff: "₦2,500" }))) data.set(key, String(value));
    data.append("categoryIds", "cat_shirts");
    data.append("categoryIds", "cat_trousers");
    data.delete("isActive");
    const result = parseInput(discountFormSchema({ now }), data);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.value, 2_500_00);
    assert.deepEqual(result.data.categoryIds, ["cat_shirts", "cat_trousers"]);
    assert.equal(result.data.isActive, false);
  });

  it("checks a copy's new code", () => {
    assert.equal(parseInput(discountDuplicateSchema, { id: "cpn_1", code: "new code" }).ok, true);
    const bad = parseInput(discountDuplicateSchema, { id: "cpn_1", code: "!!" });
    assert.equal(bad.ok, false);
  });
});

describe("discountStatus", () => {
  const coupon = (overrides: Partial<DiscountStatusInput> = {}): DiscountStatusInput => ({
    isActive: true,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
    ...overrides,
  });

  it("names each state", () => {
    assert.equal(discountStatus(coupon(), now), "active");
    assert.equal(discountStatus(coupon({ isActive: false }), now), "disabled");
    assert.equal(discountStatus(coupon({ startsAt: new Date("2026-10-01T00:00:00Z") }), now), "scheduled");
    assert.equal(discountStatus(coupon({ endsAt: new Date("2026-09-01T00:00:00Z") }), now), "expired");
    assert.equal(discountStatus(coupon({ usageLimit: 10, usageCount: 10 }), now), "used_up");
  });

  it("follows checkout's order: off, not started, ended, used up", () => {
    const everything = coupon({
      isActive: false,
      startsAt: new Date("2026-10-01T00:00:00Z"),
      endsAt: new Date("2026-09-01T00:00:00Z"),
      usageLimit: 1,
      usageCount: 1,
    });
    assert.equal(discountStatus(everything, now), "disabled");
    assert.equal(discountStatus({ ...everything, isActive: true }, now), "scheduled");
    assert.equal(discountStatus({ ...everything, isActive: true, startsAt: null }, now), "expired");
    assert.equal(discountStatus({ ...everything, isActive: true, startsAt: null, endsAt: null }, now), "used_up");
  });

  it("treats the start as working and the end as stopped, to the millisecond", () => {
    assert.equal(discountStatus(coupon({ startsAt: now }), now), "active");
    assert.equal(discountStatus(coupon({ endsAt: now }), now), "expired");
  });

  it("describes the state in Lagos time", () => {
    const display = discountStatusDisplay(coupon({ startsAt: new Date("2026-10-01T08:00:00Z") }), now);
    assert.equal(display.label, "Scheduled");
    assert.match(display.description, /Starts 1 Oct 2026, 09:00/);
    assert.equal(discountStatusDisplay(coupon({ isActive: false }), now).label, "Switched off");
  });
});

describe("describing a rule", () => {
  const base = { type: "PERCENTAGE" as const, value: 10, minSubtotal: null, maxDiscount: null };

  it("says it in one line", () => {
    assert.equal(describeDiscountRule(base), "10% off every order");
    assert.equal(
      describeDiscountRule({ ...base, minSubtotal: 50_000_00, maxDiscount: 10_000_00 }),
      "10% off orders of ₦50,000 or more, up to ₦10,000",
    );
    assert.equal(
      describeDiscountRule({ type: "FIXED", value: 5_000_00, minSubtotal: 30_000_00, maxDiscount: null }),
      "₦5,000 off orders of ₦30,000 or more",
    );
  });

  // The form only offers a cap on percentages, but evaluateCoupon applies one to either kind. A
  // fixed code carrying a cap from elsewhere must still be described as checkout will treat it,
  // or the list would promise ₦5,000 off where the customer is given ₦1,000.
  it("names a cap on a fixed amount, which checkout applies too", () => {
    assert.equal(
      describeDiscountRule({ type: "FIXED", value: 5_000_00, minSubtotal: null, maxDiscount: 1_000_00 }),
      "₦5,000 off every order, up to ₦1,000",
    );
    const details = describeDiscountDetails({
      type: "FIXED",
      value: 5_000_00,
      minSubtotal: null,
      maxDiscount: 1_000_00,
      usageLimit: null,
      perCustomerLimit: null,
      startsAt: null,
      endsAt: null,
    });
    assert.match(details.join(" "), /Never more than ₦1,000 off one order/);
  });

  it("names what a restricted code covers (either list qualifies)", () => {
    assert.equal(describeDiscountRule({ ...base, categoryNames: ["Shirts"] }), "10% off items in Shirts");
    assert.equal(
      describeDiscountRule({ ...base, categoryNames: ["Shirts", "Trousers"], productNames: ["Knitted Polo"], minSubtotal: 20_000_00 }),
      "10% off items in Shirts or Trousers, plus Knitted Polo, on orders of ₦20,000 or more",
    );
    assert.equal(
      describeDiscountRule({ ...base, productNames: ["A", "B", "C", "D"] }),
      "10% off 4 chosen products",
    );
  });

  it("spells out the details checkout applies", () => {
    const lines = describeDiscountDetails({
      ...base,
      categoryNames: ["Shirts"],
      minSubtotal: 50_000_00,
      usageLimit: 100,
      perCustomerLimit: 1,
      startsAt: new Date("2026-10-01T08:00:00Z"),
      endsAt: new Date("2026-10-31T22:59:00Z"),
    });
    const text = lines.join(" ");
    assert.match(text, /Other items in the bag pay full price/);
    assert.match(text, /rounded down to the naira/);
    assert.match(text, /counting items the code doesn’t cover/);
    assert.match(text, /100 orders in total, counting checkouts still awaiting payment/);
    assert.match(text, /once, checked by email address/);
    assert.match(text, /1 Oct 2026, 09:00 and stops at 31 Oct 2026, 23:59/);
  });

  it("summarises uses, limits and dates", () => {
    assert.equal(describeUses(12, 100), "12 of 100");
    assert.equal(describeUses(1234, null), "1,234");
    assert.equal(describePerCustomer(null), "No limit");
    assert.equal(describePerCustomer(1), "Once each");
    assert.equal(describePerCustomer(3), "3 each");
    assert.equal(describeSchedule({ startsAt: null, endsAt: null }), "No start or end date");
    assert.equal(describeSchedule({ startsAt: null, endsAt: new Date("2026-10-31T22:59:00Z") }), "Until 31 Oct 2026, 23:59");
  });

  it("flags rules worth a second look", () => {
    assert.match(discountWarnings({ ...base, value: 100, endsAt: null }, now).join(" "), /whole bag is free/);
    assert.match(discountWarnings({ ...base, value: 60, endsAt: null }, now).join(" "), /no maximum discount/);
    assert.deepEqual(discountWarnings({ ...base, value: 60, maxDiscount: 5_000_00, endsAt: null }, now), []);
    assert.match(
      discountWarnings({ type: "FIXED", value: 10_000_00, minSubtotal: 10_000_00, maxDiscount: null, endsAt: null }, now).join(" "),
      /could be free/,
    );
  });
});

describe("previewDiscount", () => {
  const draft = {
    code: " summer 10 ",
    type: "PERCENTAGE",
    percentOff: "10",
    amountOff: "",
    minSubtotal: "50,000",
    maxDiscount: "10,000",
    startsAt: "",
    endsAt: "",
    usageLimit: "",
    perCustomerLimit: "",
    categoryNames: [],
    productNames: [],
  };

  it("uses the saved code's wording for what's typed", () => {
    const preview = previewDiscount(draft, now);
    assert.equal(preview.code, "SUMMER10");
    assert.equal(preview.summary, "10% off orders of ₦50,000 or more, up to ₦10,000");
    assert.ok(preview.details.length > 0);
  });

  it("waits for the discount itself", () => {
    assert.equal(previewDiscount({ ...draft, percentOff: "" }, now).summary, null);
    assert.equal(previewDiscount({ ...draft, percentOff: "150" }, now).summary, null);
    assert.equal(previewDiscount({ ...draft, type: "" }, now).summary, null);
    assert.equal(previewDiscount({ ...draft, code: "x" }, now).code, "");
  });

  // The form clears a fixed code's cap when it saves, so the summary shows it already gone.
  it("leaves the cap out of a fixed amount, as saving will", () => {
    const preview = previewDiscount({ ...draft, type: "FIXED", amountOff: "2,000" }, now);
    assert.equal(preview.summary, "₦2,000 off orders of ₦50,000 or more");
  });
});

describe("describeDiscountChanges", () => {
  const before: DiscountSnapshot = {
    code: "WELCOME10",
    description: null,
    type: "PERCENTAGE",
    value: 10,
    minSubtotal: null,
    maxDiscount: null,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    perCustomerLimit: 1,
    categoryIds: ["a", "b"],
    productIds: [],
  };

  it("lists what changed", () => {
    const after: DiscountSnapshot = {
      ...before,
      value: 15,
      endsAt: new Date("2026-10-31T22:59:00Z"),
      usageLimit: 50,
      categoryIds: ["b", "a"],
    };
    assert.deepEqual(describeDiscountChanges(before, after), [
      "discount 10% → 15%",
      "end none → 31 Oct 2026, 23:59",
      "total uses no limit → 50",
    ]);
    assert.equal(changesDiscountAmount(before, after), true);
  });

  it("knows when only limits and dates changed", () => {
    const after = { ...before, usageLimit: 10, endsAt: new Date("2026-12-01T00:00:00Z") };
    assert.equal(changesDiscountAmount(before, after), false);
    assert.equal(changesDiscountAmount(before, { ...before, productIds: ["p"] }), true);
    assert.deepEqual(describeDiscountChanges(before, before), []);
  });
});

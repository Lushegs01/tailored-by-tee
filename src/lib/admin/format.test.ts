import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_KOBO,
  formatAdminDate,
  formatAdminDateTime,
  formatKobo,
  formatNumber,
  formatRelative,
  koboToNairaInput,
  parseNairaToKobo,
} from "./format";

describe("formatKobo", () => {
  it("shows whole naira like the storefront", () => {
    assert.equal(formatKobo(1_250_000), "₦12,500");
    assert.equal(formatKobo(0), "₦0");
  });

  it("never rounds away kobo", () => {
    assert.equal(formatKobo(1_250_050), "₦12,500.50");
    assert.equal(formatKobo(1), "₦0.01");
  });

  it("marks negative amounts with a minus sign", () => {
    assert.equal(formatKobo(-50_000), "−₦500");
  });

  it("shows a dash for nonsense", () => {
    assert.equal(formatKobo(Number.NaN), "—");
  });
});

describe("parseNairaToKobo", () => {
  it("accepts the ways people write naira amounts", () => {
    const cases: [string, number][] = [
      ["12500", 1_250_000],
      ["12,500", 1_250_000],
      ["₦12,500", 1_250_000],
      ["₦ 12,500", 1_250_000],
      ["N12500", 1_250_000],
      ["ngn 12,500", 1_250_000],
      ["  12500  ", 1_250_000],
      ["12500.5", 1_250_050],
      ["12500.50", 1_250_050],
      ["12,500.05", 1_250_005],
      ["1,234,567", 123_456_700],
      ["0", 0],
      ["0.99", 99],
    ];
    for (const [input, expected] of cases) assert.equal(parseNairaToKobo(input), expected, input);
  });

  it("rejects anything that is not a clear, non-negative amount", () => {
    for (const input of [
      "",
      "   ",
      "₦",
      "-500",
      "−500",
      "12500.505",
      "12,50",
      "1,2345",
      ",500",
      "500,",
      "12.",
      ".5",
      "12 500",
      "abc",
      "NaN",
      "Infinity",
      "1e5",
      "0x10",
      "12500..5",
    ]) {
      assert.equal(parseNairaToKobo(input), null, JSON.stringify(input));
    }
  });

  it("rejects amounts the database cannot hold", () => {
    assert.equal(parseNairaToKobo("21474836.47"), MAX_KOBO);
    assert.equal(parseNairaToKobo("21474836.48"), null);
    assert.equal(parseNairaToKobo("99999999999999999999"), null);
  });

  it("returns integers only", () => {
    for (const input of ["0.1", "0.29", "19.99", "1234.57"]) {
      assert.ok(Number.isInteger(parseNairaToKobo(input)), input);
    }
    assert.equal(parseNairaToKobo("0.29"), 29);
    assert.equal(parseNairaToKobo("19.99"), 1999);
  });
});

describe("koboToNairaInput", () => {
  it("gives a readable starting value that parses back to the same kobo", () => {
    for (const kobo of [0, 1, 99, 100, 1_250_000, 1_250_050, 123_456_789]) {
      const text = koboToNairaInput(kobo);
      assert.equal(parseNairaToKobo(text), kobo, `${kobo} → ${text}`);
    }
    assert.equal(koboToNairaInput(1_250_000), "12,500");
    assert.equal(koboToNairaInput(1_250_050), "12,500.50");
    assert.equal(koboToNairaInput(1_250_005), "12,500.05");
  });

  it("is empty for a missing amount", () => {
    assert.equal(koboToNairaInput(null), "");
    assert.equal(koboToNairaInput(undefined), "");
  });
});

describe("formatNumber", () => {
  it("groups thousands and shows whole numbers", () => {
    assert.equal(formatNumber(0), "0");
    assert.equal(formatNumber(1234), "1,234");
    assert.equal(formatNumber(1_234_567), "1,234,567");
    assert.equal(formatNumber(-12), "−12");
    assert.equal(formatNumber(Number.POSITIVE_INFINITY), "—");
  });
});

describe("admin dates", () => {
  // 13:30 UTC is 14:30 in Lagos (UTC+1, no daylight saving).
  const moment = new Date("2026-09-14T13:30:00.000Z");

  it("formats in Lagos time", () => {
    assert.equal(formatAdminDate(moment), "14 Sep 2026");
    assert.equal(formatAdminDateTime(moment), "14 Sep 2026, 14:30");
    assert.equal(formatAdminDateTime("2026-09-14T23:30:00.000Z"), "15 Sep 2026, 00:30");
  });

  it("accepts ISO strings and tolerates invalid input", () => {
    assert.equal(formatAdminDate("2026-01-02T10:00:00.000Z"), "2 Jan 2026");
    assert.equal(formatAdminDate("not a date"), "—");
    assert.equal(formatAdminDateTime(Number.NaN), "—");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-09-16T12:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it("describes recent moments in words", () => {
    assert.equal(formatRelative(ago(10_000), now), "just now");
    assert.equal(formatRelative(ago(50_000), now), "1 minute ago");
    assert.equal(formatRelative(ago(5 * MINUTE), now), "5 minutes ago");
    assert.equal(formatRelative(ago(90 * MINUTE), now), "1 hour ago");
    assert.equal(formatRelative(ago(3 * HOUR), now), "3 hours ago");
    assert.equal(formatRelative(ago(23.9 * HOUR), now), "23 hours ago");
    assert.equal(formatRelative(ago(30 * HOUR), now), "1 day ago");
    assert.equal(formatRelative(ago(4 * DAY), now), "4 days ago");
  });

  it("handles the future", () => {
    assert.equal(formatRelative(new Date(now.getTime() + 20 * MINUTE), now), "in 20 minutes");
  });

  it("falls back to the date from a week away", () => {
    assert.equal(formatRelative(ago(8 * DAY), now), "8 Sep 2026");
  });

  it("tolerates invalid input", () => {
    assert.equal(formatRelative("nope", now), "—");
  });
});

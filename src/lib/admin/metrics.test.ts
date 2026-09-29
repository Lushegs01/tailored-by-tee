import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_OVERVIEW_PERIOD,
  OVERVIEW_PERIODS,
  addCalendarDays,
  averageOrderValue,
  calendarDayKey,
  chartAxisLabels,
  compareFigures,
  describeChange,
  describePeriodDates,
  formatCompactNaira,
  lagosBucketKey,
  lagosCalendarDay,
  overviewHref,
  overviewPeriodOption,
  parseOverviewPeriod,
  parseSalesMode,
  peakPoint,
  revenueScale,
  salesBuckets,
  salesPeriod,
  startOfLagosDay,
  summariseSales,
  type SalesAggregateRow,
} from "./metrics";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ── Parameters ─────────────────────────────────────────────────────────── */

describe("parseOverviewPeriod", () => {
  it("accepts the four periods", () => {
    for (const option of OVERVIEW_PERIODS) assert.equal(parseOverviewPeriod(option.value), option.value);
  });

  it("falls back to 30 days for anything else", () => {
    assert.equal(DEFAULT_OVERVIEW_PERIOD, "30d");
    for (const value of [undefined, null, "", "30", "1y", "TODAY", " 7d", 7, {}]) {
      assert.equal(parseOverviewPeriod(value), "30d", String(value));
    }
  });

  it("reads the first of a repeated parameter", () => {
    assert.equal(parseOverviewPeriod(["7d", "90d"]), "7d");
    assert.equal(parseOverviewPeriod(["nonsense", "7d"]), "30d");
  });

  it("describes each period", () => {
    assert.deepEqual(
      OVERVIEW_PERIODS.map((option) => [option.value, option.days]),
      [
        ["today", 1],
        ["7d", 7],
        ["30d", 30],
        ["90d", 90],
      ],
    );
    assert.equal(overviewPeriodOption("today").comparison, "yesterday by this time");
  });
});

describe("parseSalesMode", () => {
  it("shows real sales unless test sales are asked for exactly", () => {
    assert.equal(parseSalesMode("test"), "test");
    assert.equal(parseSalesMode(["test"]), "test");
    for (const value of [undefined, "", "live", "TEST", "true", "1", ["live", "test"]]) {
      assert.equal(parseSalesMode(value), "live", String(value));
    }
  });
});

describe("overviewHref", () => {
  it("leaves the defaults out of the URL", () => {
    assert.equal(overviewHref("30d", "live"), "/admin");
    assert.equal(overviewHref("7d", "live"), "/admin?period=7d");
    assert.equal(overviewHref("30d", "test"), "/admin?mode=test");
    assert.equal(overviewHref("today", "test"), "/admin?period=today&mode=test");
  });
});

/* ── Lagos calendar ─────────────────────────────────────────────────────── */

describe("lagosCalendarDay", () => {
  it("is an hour ahead of UTC, so late-evening UTC is already tomorrow", () => {
    assert.deepEqual(lagosCalendarDay(new Date("2026-09-16T22:59:59.999Z")), { year: 2026, month: 9, day: 16 });
    assert.deepEqual(lagosCalendarDay(new Date("2026-09-16T23:00:00.000Z")), { year: 2026, month: 9, day: 17 });
    assert.deepEqual(lagosCalendarDay(new Date("2026-12-31T23:30:00.000Z")), { year: 2027, month: 1, day: 1 });
  });
});

describe("addCalendarDays", () => {
  it("crosses months, years and leap days", () => {
    assert.deepEqual(addCalendarDays({ year: 2026, month: 9, day: 16 }, -29), { year: 2026, month: 8, day: 18 });
    assert.deepEqual(addCalendarDays({ year: 2026, month: 1, day: 1 }, -1), { year: 2025, month: 12, day: 31 });
    assert.deepEqual(addCalendarDays({ year: 2028, month: 2, day: 28 }, 1), { year: 2028, month: 2, day: 29 });
    assert.deepEqual(addCalendarDays({ year: 2027, month: 2, day: 28 }, 1), { year: 2027, month: 3, day: 1 });
  });
});

describe("startOfLagosDay", () => {
  it("is 23:00 UTC the evening before", () => {
    assert.equal(startOfLagosDay({ year: 2026, month: 9, day: 16 }).toISOString(), "2026-09-15T23:00:00.000Z");
    assert.equal(startOfLagosDay({ year: 2027, month: 1, day: 1 }).toISOString(), "2026-12-31T23:00:00.000Z");
  });

  it("round-trips with lagosCalendarDay", () => {
    const day = { year: 2026, month: 3, day: 29 };
    assert.deepEqual(lagosCalendarDay(startOfLagosDay(day)), day);
    assert.deepEqual(lagosCalendarDay(new Date(startOfLagosDay(day).getTime() - 1)), { year: 2026, month: 3, day: 28 });
  });
});

describe("lagosBucketKey", () => {
  it("keys by Lagos day or hour", () => {
    const instant = new Date("2026-09-16T23:15:00.000Z"); // 00:15 on the 17th in Lagos
    assert.equal(lagosBucketKey(instant, "day"), "2026-09-17");
    assert.equal(lagosBucketKey(instant, "hour"), "2026-09-17T00");
    assert.equal(lagosBucketKey(new Date("2026-09-16T12:59:00.000Z"), "hour"), "2026-09-16T13");
  });

  it("pads to match Postgres to_char", () => {
    assert.equal(calendarDayKey({ year: 2026, month: 1, day: 5 }), "2026-01-05");
  });
});

/* ── Periods ────────────────────────────────────────────────────────────── */

describe("salesPeriod", () => {
  // 14:30 in Lagos on Wednesday 16 September 2026.
  const now = new Date("2026-09-16T13:30:00.000Z");

  it("covers today, from Lagos midnight, charted by hour", () => {
    const period = salesPeriod("today", now);
    assert.equal(period.granularity, "hour");
    assert.equal(period.start.toISOString(), "2026-09-15T23:00:00.000Z");
    assert.equal(period.end.toISOString(), "2026-09-16T23:00:00.000Z");
    // Compared with yesterday up to the same time, not all of yesterday.
    assert.equal(period.previousStart.toISOString(), "2026-09-14T23:00:00.000Z");
    assert.equal(period.previousEnd.toISOString(), "2026-09-15T13:30:00.000Z");
  });

  it("covers whole Lagos days ending today", () => {
    const period = salesPeriod("30d", now);
    assert.equal(period.granularity, "day");
    assert.deepEqual(period.firstDay, { year: 2026, month: 8, day: 18 });
    assert.deepEqual(period.lastDay, { year: 2026, month: 9, day: 16 });
    assert.equal(period.start.toISOString(), "2026-08-17T23:00:00.000Z");
    assert.equal(period.end.toISOString(), "2026-09-16T23:00:00.000Z");
  });

  it("compares with an equal stretch of time just before", () => {
    for (const option of OVERVIEW_PERIODS) {
      const period = salesPeriod(option.value, now);
      const current = now.getTime() - period.start.getTime();
      const previous = period.previousEnd.getTime() - period.previousStart.getTime();
      assert.equal(previous, current, option.value);
      assert.equal(period.start.getTime() - period.previousStart.getTime(), option.days * DAY, option.value);
      assert.ok(period.previousEnd.getTime() <= period.start.getTime(), option.value);
    }
  });

  it("uses the Lagos date just after UTC midnight's Lagos rollover", () => {
    const lateEvening = new Date("2026-09-16T23:05:00.000Z"); // 00:05 on the 17th in Lagos
    const period = salesPeriod("7d", lateEvening);
    assert.deepEqual(period.lastDay, { year: 2026, month: 9, day: 17 });
    assert.deepEqual(period.firstDay, { year: 2026, month: 9, day: 11 });
    assert.equal(period.previousEnd.toISOString(), "2026-09-09T23:05:00.000Z");
  });
});

describe("describePeriodDates", () => {
  const range = (from: [number, number, number], to: [number, number, number]) =>
    describePeriodDates({
      firstDay: { year: from[0], month: from[1], day: from[2] },
      lastDay: { year: to[0], month: to[1], day: to[2] },
    });

  it("says as little as it needs to", () => {
    assert.equal(range([2026, 9, 16], [2026, 9, 16]), "16 Sep 2026");
    assert.equal(range([2026, 9, 10], [2026, 9, 16]), "10–16 Sep 2026");
    assert.equal(range([2026, 8, 18], [2026, 9, 16]), "18 Aug – 16 Sep 2026");
    assert.equal(range([2025, 12, 3], [2026, 1, 1]), "3 Dec 2025 – 1 Jan 2026");
  });
});

describe("salesBuckets", () => {
  const now = new Date("2026-09-16T13:30:00.000Z");

  it("has one bucket per Lagos day, oldest first", () => {
    const buckets = salesBuckets(salesPeriod("7d", now));
    assert.deepEqual(
      buckets.map((bucket) => bucket.key),
      ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16"],
    );
    assert.equal(buckets[6].label, "Wed 16 Sep");
    assert.equal(buckets[6].tickLabel, "16 Sep");
    assert.equal(buckets[6].start.toISOString(), "2026-09-15T23:00:00.000Z");
    assert.equal(salesBuckets(salesPeriod("90d", now)).length, 90);
  });

  it("has 24 hours for today, keyed like lagosBucketKey", () => {
    const buckets = salesBuckets(salesPeriod("today", now));
    assert.equal(buckets.length, 24);
    assert.equal(buckets[0].key, "2026-09-16T00");
    assert.equal(buckets[14].key, lagosBucketKey(now, "hour"));
    assert.equal(buckets[14].label, "14:00–15:00");
    assert.equal(buckets[23].label, "23:00–00:00");
    assert.equal(buckets[23].tickLabel, "23:00");
  });

  it("keys every day the same way the query does", () => {
    for (const bucket of salesBuckets(salesPeriod("90d", now))) {
      assert.equal(lagosBucketKey(bucket.start, "day"), bucket.key);
      assert.equal(lagosBucketKey(new Date(bucket.start.getTime() + DAY - 1), "day"), bucket.key);
    }
  });
});

/* ── Summaries ──────────────────────────────────────────────────────────── */

describe("summariseSales", () => {
  const buckets = salesBuckets(salesPeriod("7d", new Date("2026-09-16T13:30:00.000Z")));
  const row = (overrides: Partial<SalesAggregateRow>): SalesAggregateRow => ({
    current: true,
    isTest: false,
    bucket: "2026-09-16",
    orders: 1,
    revenue: 1_000_000,
    units: 1,
    ...overrides,
  });

  const rows: SalesAggregateRow[] = [
    row({ bucket: "2026-09-16", orders: 2, revenue: 3_000_000, units: 3 }),
    row({ bucket: "2026-09-12", orders: 1, revenue: 1_250_050, units: 2 }),
    row({ bucket: "2026-09-16", isTest: true, orders: 4, revenue: 9_900_000, units: 5 }),
    row({ current: false, bucket: null, orders: 5, revenue: 2_000_000, units: 6 }),
    row({ current: false, bucket: null, isTest: true, orders: 1, revenue: 500_000, units: 1 }),
    // A bucket outside the chart (should never happen) still counts towards the totals.
    row({ bucket: "2026-01-01", orders: 1, revenue: 100, units: 1 }),
  ];

  it("keeps real sales and test sales apart", () => {
    const live = summariseSales(rows, buckets, "live");
    assert.deepEqual(live.current, { orders: 4, revenue: 4_250_150, units: 6 });
    assert.deepEqual(live.previous, { orders: 5, revenue: 2_000_000, units: 6 });
    assert.deepEqual(live.otherMode, { orders: 4, revenue: 9_900_000, units: 5 });

    const test = summariseSales(rows, buckets, "test");
    assert.deepEqual(test.current, { orders: 4, revenue: 9_900_000, units: 5 });
    assert.deepEqual(test.previous, { orders: 1, revenue: 500_000, units: 1 });
    assert.deepEqual(test.otherMode, { orders: 4, revenue: 4_250_150, units: 6 });
  });

  it("charts every bucket, empty days as zero", () => {
    const { series } = summariseSales(rows, buckets, "live");
    assert.equal(series.length, 7);
    assert.deepEqual(
      series.map((point) => point.revenue),
      [0, 0, 1_250_050, 0, 0, 0, 3_000_000],
    );
    assert.deepEqual(
      series.map((point) => point.orders),
      [0, 0, 1, 0, 0, 0, 2],
    );
    assert.equal(series[6].label, "Wed 16 Sep");
  });

  it("is all zeros with no rows", () => {
    const summary = summariseSales([], buckets, "live");
    assert.deepEqual(summary.current, { orders: 0, revenue: 0, units: 0 });
    assert.ok(summary.series.every((point) => point.revenue === 0 && point.orders === 0));
  });
});

describe("averageOrderValue", () => {
  it("divides revenue by orders, to the kobo", () => {
    assert.equal(averageOrderValue({ orders: 3, revenue: 1_000_000 }), 333_333);
    assert.equal(averageOrderValue({ orders: 2, revenue: 5_000_001 }), 2_500_001);
  });

  it("has no average without orders", () => {
    assert.equal(averageOrderValue({ orders: 0, revenue: 0 }), null);
  });
});

describe("compareFigures", () => {
  it("gives the direction and whole percent", () => {
    assert.deepEqual(compareFigures(150, 100), { direction: "up", percent: 50, same: false });
    assert.deepEqual(compareFigures(75, 100), { direction: "down", percent: 25, same: false });
    assert.deepEqual(compareFigures(0, 100), { direction: "down", percent: 100, same: false });
    assert.deepEqual(compareFigures(350, 100), { direction: "up", percent: 250, same: false });
  });

  it("calls tiny changes flat, and says when they're exactly equal", () => {
    assert.deepEqual(compareFigures(100, 100), { direction: "flat", percent: 0, same: true });
    assert.deepEqual(compareFigures(10_004, 10_000), { direction: "flat", percent: 0, same: false });
  });

  it("never invents a percentage from nothing", () => {
    assert.equal(compareFigures(500, 0), null);
    assert.equal(compareFigures(0, 0), null);
    assert.equal(compareFigures(500, null), null);
    assert.equal(compareFigures(null, 500), null);
    assert.equal(compareFigures(Number.NaN, 500), null);
  });
});

describe("describeChange", () => {
  it("reads as a short phrase", () => {
    assert.equal(describeChange({ direction: "up", percent: 12, same: false }, "the 7 days before"), "12% vs the 7 days before");
    assert.equal(describeChange({ direction: "down", percent: 1250, same: false }, "the 90 days before"), "1,250% vs the 90 days before");
    assert.equal(describeChange({ direction: "flat", percent: 0, same: true }, "yesterday by this time"), "Same as yesterday by this time");
    assert.equal(describeChange({ direction: "flat", percent: 0, same: false }, "the 30 days before"), "About the same as the 30 days before");
  });
});

/* ── The chart ──────────────────────────────────────────────────────────── */

describe("revenueScale", () => {
  it("clears the largest value with three or four round gridlines", () => {
    for (const largest of [150, 999, 50_000, 1_000_000, 1_200_000, 1_500_000, 2_000_000, 7_654_321, 99_999_999, 250_000_000]) {
      const { max, ticks } = revenueScale(largest);
      assert.ok(max >= largest, `max ${max} < ${largest}`);
      assert.ok(ticks.length === 3 || ticks.length === 4, `${largest}: ${ticks.length} ticks`);
      assert.equal(ticks[0], 0);
      assert.equal(ticks.at(-1), max);
      const step = ticks[1];
      // 1, 2, 2.5 or 5 × a power of ten naira.
      const naira = step / 100;
      const leading = naira / 10 ** Math.floor(Math.log10(naira));
      assert.ok([1, 2, 2.5, 5].includes(Number(leading.toFixed(6))), `${largest}: step ₦${naira}`);
    }
  });

  it("picks steps an owner would", () => {
    assert.deepEqual(revenueScale(1_000_000).ticks, [0, 500_000, 1_000_000]);
    assert.deepEqual(revenueScale(1_200_000).ticks, [0, 500_000, 1_000_000, 1_500_000]);
    assert.deepEqual(revenueScale(4_500_000).ticks, [0, 2_000_000, 4_000_000, 6_000_000]);
  });

  it("has an axis even with nothing to show", () => {
    assert.deepEqual(revenueScale(0), { max: 100, ticks: [0, 100] });
  });
});

describe("formatCompactNaira", () => {
  it("shortens axis money", () => {
    assert.equal(formatCompactNaira(0), "₦0");
    assert.equal(formatCompactNaira(50_000), "₦500");
    assert.equal(formatCompactNaira(250_000), "₦2.5k");
    assert.equal(formatCompactNaira(5_000_000), "₦50k");
    assert.equal(formatCompactNaira(150_000_000), "₦1.5m");
    assert.equal(formatCompactNaira(250), "₦2.5");
  });
});

describe("chartAxisLabels", () => {
  it("labels every sixth hour of today", () => {
    assert.deepEqual(
      chartAxisLabels(24, "hour").map((label) => label.index),
      [0, 6, 12, 18],
    );
  });

  it("labels every day of a week, half of them on phones", () => {
    const labels = chartAxisLabels(7, "day");
    assert.deepEqual(
      labels.map((label) => label.index),
      [0, 1, 2, 3, 4, 5, 6],
    );
    assert.deepEqual(
      labels.filter((label) => !label.minor).map((label) => label.index),
      [0, 2, 4, 6],
    );
  });

  it("labels about six days of longer periods, always including today", () => {
    for (const count of [30, 90]) {
      const labels = chartAxisLabels(count, "day");
      assert.ok(labels.length >= 5 && labels.length <= 7, `${count}: ${labels.length}`);
      assert.equal(labels.at(-1)?.index, count - 1);
      assert.equal(labels.at(-1)?.minor, false);
      assert.ok(labels.every((label, index) => index === 0 || label.index > labels[index - 1].index));
    }
    assert.deepEqual(
      chartAxisLabels(30, "day").map((label) => label.index),
      [4, 9, 14, 19, 24, 29],
    );
  });

  it("has nothing to label for nothing", () => {
    assert.deepEqual(chartAxisLabels(0, "day"), []);
  });
});

describe("peakPoint", () => {
  it("finds the best bucket, the earliest on a tie", () => {
    const series = [
      { key: "a", revenue: 0 },
      { key: "b", revenue: 500 },
      { key: "c", revenue: 900 },
      { key: "d", revenue: 900 },
    ];
    assert.equal(peakPoint(series)?.key, "c");
  });

  it("is null when nothing sold", () => {
    assert.equal(peakPoint([{ revenue: 0 }, { revenue: 0 }]), null);
    assert.equal(peakPoint([]), null);
  });
});

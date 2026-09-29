import { Suspense } from "react";

import { AdminEmptyState, Stat, StatGrid, StatusBadge, type StatDelta } from "@/components/admin/ui";
import { formatKobo, formatNumber } from "@/lib/admin/format";
import {
  OVERVIEW_PERIODS,
  averageOrderValue,
  chartAxisLabels,
  compareFigures,
  describeChange,
  describePeriodDates,
  formatCompactNaira,
  overviewHref,
  overviewPeriodOption,
  peakPoint,
  revenueScale,
  type Loaded,
  type SalesMode,
  type SalesOverview,
  type SalesPeriod,
  type SalesTotals,
} from "@/lib/admin/metrics";

import { countNoun } from "./copy";
import { SalesFiguresSkeleton } from "./overview-skeletons";
import { RevenueChart } from "./revenue-chart";
import { PeriodSwitch, SalesLink, SalesPendingArea, SalesPeriodProvider } from "./sales-period";
import { SectionUnavailable } from "./section-unavailable";

/*
 * Sales for the chosen period: four headline figures with their change against
 * the period before, and revenue per day. The period switch scopes everything in
 * this frame and nothing outside it. Test payments (Paystack test keys) are never
 * added to real sales: they are counted apart and can be viewed on their own.
 */

export function SalesSection({
  period,
  mode,
  sales,
}: {
  period: SalesPeriod;
  mode: SalesMode;
  sales: Promise<Loaded<SalesOverview>>;
}) {
  const options = OVERVIEW_PERIODS.map((option) => ({
    value: option.value,
    label: option.label,
    href: overviewHref(option.value, mode),
  }));

  return (
    <SalesPeriodProvider period={period.period}>
      <section aria-labelledby="overview-sales" className="min-w-0 border bg-background-raised">
        <header className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
          <div className="min-w-0 py-1">
            <h2 id="overview-sales" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-label">
              {mode === "test" ? "Test sales" : "Sales"}
              {mode === "test" ? <StatusBadge tone="attention">No real money</StatusBadge> : null}
            </h2>
            <p className="mt-2 text-caption text-muted-foreground tabular-nums">
              {describePeriodDates(period)} <span aria-hidden="true">·</span> Lagos time
            </p>
          </div>
          <PeriodSwitch options={options} />
        </header>

        <SalesPendingArea className="p-4 md:p-5">
          <Suspense fallback={<SalesFiguresSkeleton />}>
            <SalesFigures sales={sales} period={period} mode={mode} />
          </Suspense>
        </SalesPendingArea>
      </section>
    </SalesPeriodProvider>
  );
}

async function SalesFigures({
  sales,
  period,
  mode,
}: {
  sales: Promise<Loaded<SalesOverview>>;
  period: SalesPeriod;
  mode: SalesMode;
}) {
  const result = await sales;
  if (!result.ok) return <SectionUnavailable reason={result.reason} what="Sales figures" className="py-12" />;

  const { current, previous, series, otherMode } = result.data;
  const option = overviewPeriodOption(period.period);
  const average = averageOrderValue(current);
  const hour = period.granularity === "hour";

  const delta = (now: number | null, before: number | null): StatDelta | undefined => {
    const change = compareFigures(now, before);
    if (!change) return undefined;
    return {
      label: describeChange(change, option.comparison),
      direction: change.direction,
      tone: change.direction === "up" ? "positive" : change.direction === "down" ? "critical" : "neutral",
    };
  };

  const comparisonNote =
    previous.orders === 0
      ? `No paid orders ${period.period === "today" ? option.comparison : `in ${option.comparison}`}, so there’s nothing to compare with yet.`
      : period.period === "today"
        ? `Changes compare with ${option.comparison}.`
        : `Changes compare with ${option.comparison}, up to the same time of day.`;

  return (
    <div className="space-y-6">
      <ModeNote mode={mode} period={period} otherMode={otherMode} />

      <div>
        <StatGrid>
          <Stat
            label="Revenue"
            value={formatKobo(current.revenue)}
            delta={delta(current.revenue, previous.revenue)}
            hint="Paid orders, less refunds"
          />
          <Stat
            label="Orders"
            value={formatNumber(current.orders)}
            delta={delta(current.orders, previous.orders)}
            hint="Paid in this period"
          />
          <Stat
            label="Average order"
            value={average === null ? "—" : formatKobo(average)}
            delta={delta(average, averageOrderValue(previous))}
            hint="Revenue per paid order"
          />
          <Stat
            label="Pieces sold"
            value={formatNumber(current.units)}
            delta={delta(current.units, previous.units)}
            hint="Items in those orders"
          />
        </StatGrid>
        <p className="mt-3 max-w-3xl text-caption text-muted-foreground">
          Each order counts when it was paid, not when it was placed. Cancelled, refunded and demo orders are left out
          {mode === "live" ? ", and so are test payments" : ""}. {comparisonNote}
        </p>
      </div>

      <RevenueByDay series={series} period={period} hour={hour} />
    </div>
  );
}

/** Says, every time, how test payments are being treated, and offers the other view when there's one to see. */
function ModeNote({ mode, period, otherMode }: { mode: SalesMode; period: SalesPeriod; otherMode: SalesTotals }) {
  const when = period.period === "today" ? "today" : "in this period";

  if (mode === "test") {
    return (
      <div className="flex flex-col gap-2 border border-accent-brand/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-body-sm">
          <span className="font-medium">You’re looking at test payments.</span>{" "}
          <span className="text-muted-foreground">
            These orders were paid with Paystack test keys, so no real money moved. They never count towards real
            sales.
            {otherMode.orders > 0
              ? ` Real sales ${when}: ${countNoun(otherMode.orders, "order")}, ${formatKobo(otherMode.revenue)}.`
              : ""}
          </span>
        </p>
        <SalesLink href={overviewHref(period.period, "live")} className="shrink-0">
          Back to real sales
        </SalesLink>
      </div>
    );
  }

  if (otherMode.orders === 0) return null;

  return (
    <div className="flex flex-col gap-2 border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <p className="text-body-sm">
        <span className="font-medium">Test payments are left out.</span>{" "}
        <span className="text-muted-foreground">
          {countNoun(otherMode.orders, "order")} ({formatKobo(otherMode.revenue)}){" "}
          {otherMode.orders === 1 ? "was" : "were"} paid with Paystack test keys {when}, so no real money moved.
        </span>
      </p>
      <SalesLink href={overviewHref(period.period, "test")} className="shrink-0">
        View test sales
      </SalesLink>
    </div>
  );
}

function RevenueByDay({ series, period, hour }: { series: SalesOverview["series"]; period: SalesPeriod; hour: boolean }) {
  const name = hour ? "Revenue by hour" : "Revenue by day";
  const peak = peakPoint(series);

  return (
    <section aria-labelledby="overview-revenue-chart">
      <h3 id="overview-revenue-chart" className="text-label">
        {name}
      </h3>

      {peak === null ? (
        <div className="mt-4 border bg-background">
          <AdminEmptyState
            as="p"
            title={hour ? "No sales yet today" : "No sales in this period"}
            body={
              hour
                ? "Paid orders will show here by the hour they were paid."
                : period.period === "90d"
                  ? "Paid orders will show here by the day they were paid."
                  : "Paid orders will show here by the day they were paid. Try a longer period to see earlier sales."
            }
          />
        </div>
      ) : (
        <div className="mt-4">
          <RevenueChart
            name={`${name}, ${describePeriodDates(period)}`}
            unit={hour ? "hour" : "day"}
            bars={series.map((point) => ({
              key: point.key,
              label: point.label,
              value: point.revenue,
              valueText: formatKobo(point.revenue),
              detailText: point.orders > 0 ? countNoun(point.orders, "order") : "No orders",
            }))}
            {...chartScale(peak.revenue)}
            axisLabels={chartAxisLabels(series.length, period.granularity).map((label) => ({
              ...label,
              text: series[label.index]?.tickLabel ?? "",
            }))}
            idle={{
              caption: `${hour ? "Best hour" : "Best day"}: ${peak.label}`,
              valueText: formatKobo(peak.revenue),
              detailText: countNoun(peak.orders, "order"),
            }}
          />

          <table className="sr-only">
            <caption>
              {name}, {describePeriodDates(period)}, Lagos time
            </caption>
            <thead>
              <tr>
                <th scope="col">{hour ? "Hour" : "Day"}</th>
                <th scope="col">Revenue</th>
                <th scope="col">Paid orders</th>
              </tr>
            </thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.key}>
                  <th scope="row">{point.label}</th>
                  <td>{formatKobo(point.revenue)}</td>
                  <td>{formatNumber(point.orders)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function chartScale(largest: number) {
  const scale = revenueScale(largest);
  return {
    max: scale.max,
    ticks: scale.ticks.map((value) => ({ value, label: formatCompactNaira(value) })),
  };
}

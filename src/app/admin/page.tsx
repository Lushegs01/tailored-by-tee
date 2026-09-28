import { Suspense } from "react";

import { AttentionSection } from "@/components/admin/overview/attention-section";
import { AttentionSkeleton, SectionListSkeleton } from "@/components/admin/overview/overview-skeletons";
import { RecentOrdersSection } from "@/components/admin/overview/recent-orders-section";
import { SalesSection } from "@/components/admin/overview/sales-section";
import { StockWatchSection } from "@/components/admin/overview/stock-watch-section";
import { AdminPageHeader } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin/auth";
import { adminMetadata } from "@/lib/admin/metadata";
import {
  getRecentOrders,
  getSalesOverview,
  getStockWatch,
  getWorkQueue,
  parseOverviewPeriod,
  parseSalesMode,
  salesPeriod,
} from "@/lib/admin/metrics";

export const metadata = adminMetadata("Overview");

/**
 * /admin — the owner's first stop: what needs doing now (orders to fulfil,
 * refunds due, reviews), sales for a period (?period=today|7d|30d|90d, default 30
 * days; ?mode=test shows Paystack test payments on their own), the latest orders
 * and stock that is low or sold out.
 *
 * The four queries start together here and each section streams in behind its
 * own skeleton, so a slow or failed one never holds up the rest.
 */
export default async function AdminOverviewPage(props: PageProps<"/admin">) {
  await requireAdminPage("/admin");

  const searchParams = await props.searchParams;
  const now = new Date();
  const period = salesPeriod(parseOverviewPeriod(searchParams.period), now);
  const mode = parseSalesMode(searchParams.mode);

  const workQueue = getWorkQueue(now);
  const sales = getSalesOverview(period, mode);
  const recentOrders = getRecentOrders(8);
  const stockWatch = getStockWatch(5);

  return (
    <div className="space-y-8 md:space-y-10">
      <AdminPageHeader
        title="Overview"
        description="What needs you now, and how sales are going. All times are Lagos time."
      />

      <Suspense fallback={<AttentionSkeleton />}>
        <AttentionSection queue={workQueue} />
      </Suspense>

      <SalesSection period={period} mode={mode} sales={sales} />

      <div className="grid gap-8 md:gap-10 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] 2xl:items-start">
        <Suspense fallback={<SectionListSkeleton label="Loading the latest orders" rows={8} />}>
          <RecentOrdersSection orders={recentOrders} now={now} />
        </Suspense>
        <Suspense fallback={<SectionListSkeleton label="Loading stock to watch" rows={5} />}>
          <StockWatchSection stock={stockWatch} />
        </Suspense>
      </div>
    </div>
  );
}

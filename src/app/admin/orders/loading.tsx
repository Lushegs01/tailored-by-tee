import { PageHeaderSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/admin/ui";

/** The orders page's shape while it loads: header, the four figures, then the toolbar and table. */
export default function OrdersLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <StatGridSkeleton className="mt-6" />
      <TableSkeleton header={false} columns={8} className="mt-8" />
    </div>
  );
}

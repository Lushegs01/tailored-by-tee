import { PageHeaderSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/admin/ui";

/** The inventory page's shape while it loads: header, the four figures, then the toolbar and stock table. */
export default function InventoryLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <StatGridSkeleton className="mt-6" />
      <TableSkeleton header={false} columns={7} className="mt-8" />
    </div>
  );
}

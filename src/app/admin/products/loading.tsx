import { PageHeaderSkeleton, TableSkeleton } from "@/components/admin/ui";

/** The product list's shape while it loads: header, then the toolbar and table. */
export default function ProductsLoading() {
  return (
    <div>
      <PageHeaderSkeleton actions />
      <TableSkeleton columns={7} className="mt-6" />
    </div>
  );
}

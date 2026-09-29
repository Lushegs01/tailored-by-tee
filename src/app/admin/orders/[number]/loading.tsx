import { FormSkeleton, PageHeaderSkeleton, TableSkeleton } from "@/components/admin/ui";

/**
 * The order page's shape while it loads: its heading, the steps panel, the
 * customer and delivery pair, then the pieces. Shaped like the page itself, so
 * nothing jumps when the order arrives.
 */
export default function OrderLoading() {
  return (
    <div className="max-w-5xl">
      <PageHeaderSkeleton actions />
      <div className="mt-6 space-y-5">
        <FormSkeleton fields={1} header={false} />
        <div className="grid gap-5 md:grid-cols-2">
          <FormSkeleton fields={4} header={false} />
          <FormSkeleton fields={4} header={false} />
        </div>
        <TableSkeleton rows={3} columns={4} toolbar={false} />
      </div>
    </div>
  );
}

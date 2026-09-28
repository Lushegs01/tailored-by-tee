import { TableSkeleton } from "@/components/admin/ui";

/** The categories list while it loads: header and a table, no search bar. */
export default function CategoriesLoading() {
  return <TableSkeleton rows={8} columns={5} toolbar={false} className="max-w-5xl" />;
}

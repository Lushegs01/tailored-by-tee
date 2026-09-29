import { TableSkeleton } from "@/components/admin/ui";

/** The collections list while it loads: header and a short table, no search bar. */
export default function CollectionsLoading() {
  return <TableSkeleton rows={4} columns={4} toolbar={false} className="max-w-5xl" />;
}

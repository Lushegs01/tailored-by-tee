import { TableSkeleton } from "@/components/admin/ui/skeletons";

/**
 * Shown in the admin content area while a page loads; the sidebar and top bar
 * stay put. Most admin pages are lists, so the default is a list page's shape.
 * Sections with other shapes (forms, the overview) add their own loading.tsx.
 */
export default function AdminLoading() {
  return <TableSkeleton />;
}

import { FormSkeleton } from "@/components/admin/ui";

/** A category's editor while it loads. */
export default function CategoryLoading() {
  return <FormSkeleton fields={4} sections={2} className="max-w-4xl" />;
}

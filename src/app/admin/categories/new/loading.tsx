import { FormSkeleton } from "@/components/admin/ui";

/** The new-category form while it loads. */
export default function NewCategoryLoading() {
  return <FormSkeleton fields={4} sections={2} className="max-w-4xl" />;
}

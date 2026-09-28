import { FormSkeleton } from "@/components/admin/ui";

/** The new-collection form while it loads. */
export default function NewCollectionLoading() {
  return <FormSkeleton fields={4} sections={3} className="max-w-4xl" />;
}

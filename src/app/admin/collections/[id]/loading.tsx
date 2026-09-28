import { FormSkeleton } from "@/components/admin/ui";

/** A collection's editor while it loads. */
export default function CollectionLoading() {
  return <FormSkeleton fields={4} sections={3} className="max-w-4xl" />;
}

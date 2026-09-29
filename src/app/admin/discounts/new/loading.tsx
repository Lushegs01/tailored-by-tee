import { FormSkeleton } from "@/components/admin/ui";

/** Shaped like the discount form while the new-discount page loads. */
export default function NewDiscountLoading() {
  return <FormSkeleton sections={3} fields={4} />;
}

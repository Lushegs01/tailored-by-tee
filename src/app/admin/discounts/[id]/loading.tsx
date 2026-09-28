import { FormSkeleton } from "@/components/admin/ui";

/** Shaped like a discount's page (header, then the form's sections) while it loads. */
export default function DiscountLoading() {
  return <FormSkeleton sections={3} fields={4} />;
}

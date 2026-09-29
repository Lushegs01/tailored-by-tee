import { FormSkeleton } from "@/components/admin/ui";

/** The product editor's shape while it loads: the header, then its stacked sections. */
export default function ProductEditorLoading() {
  return <FormSkeleton sections={3} fields={4} />;
}

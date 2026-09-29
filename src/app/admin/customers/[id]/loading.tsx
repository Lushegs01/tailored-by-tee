import { CustomerDetailSkeleton } from "@/components/admin/customers/customer-skeletons";

/** One customer's page while it loads: header, their figures, then the panels. */
export default function CustomerLoading() {
  return <CustomerDetailSkeleton />;
}

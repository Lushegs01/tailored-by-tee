import { CustomerDetailSkeleton } from "@/components/admin/customers/customer-skeletons";

/** A guest's page while it loads: header, their figures, then the panels. */
export default function GuestCustomerLoading() {
  return <CustomerDetailSkeleton />;
}

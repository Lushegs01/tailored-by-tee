import { CustomersListSkeleton } from "@/components/admin/customers/customer-skeletons";

/** The customers list's shape while it loads: header, the four figures, toolbar and rows. */
export default function CustomersLoading() {
  return <CustomersListSkeleton />;
}

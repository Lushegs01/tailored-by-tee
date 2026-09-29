import { CheckoutIgnoresCodesNotice, NoDatabaseNotice } from "@/components/admin/discounts/discount-notices";
import { DiscountForm, type DiscountFormValues } from "@/components/admin/discounts/discount-form";
import { AdminPageHeader } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin/auth";
import { DISCOUNTS_PATH, NEW_DISCOUNT_PATH } from "@/lib/admin/discount-schema";
import { getRestrictionOptions } from "@/lib/admin/discounts";
import { adminMetadata } from "@/lib/admin/metadata";
import { isDatabaseConfigured } from "@/lib/db";

export const metadata = adminMetadata("New discount");

const BLANK: DiscountFormValues = {
  code: "",
  description: "",
  type: "PERCENTAGE",
  percentOff: null,
  amountOff: null,
  minSubtotal: null,
  maxDiscount: null,
  startsAt: "",
  endsAt: "",
  usageLimit: null,
  perCustomerLimit: null,
  categoryIds: [],
  productIds: [],
  isActive: true,
};

/** /admin/discounts/new: create a code, with a live summary of what customers will get. */
export default async function NewDiscountPage() {
  await requireAdminPage(NEW_DISCOUNT_PATH);

  const header = (
    <AdminPageHeader
      title="New discount"
      breadcrumbs={[{ label: "Discounts", href: DISCOUNTS_PATH }, { label: "New discount" }]}
      description="A code customers can enter at checkout. The summary beside the form shows exactly what they’ll get."
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <>
        {header}
        <NoDatabaseNotice />
      </>
    );
  }

  const { categories, products } = await getRestrictionOptions();

  return (
    <>
      {header}
      <CheckoutIgnoresCodesNotice className="mt-6" />
      <div className="mt-6">
        <DiscountForm
          mode="create"
          initial={BLANK}
          categories={categories}
          products={products}
          nowIso={new Date().toISOString()}
        />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DeleteDiscountButton } from "@/components/admin/discounts/delete-discount";
import { DiscountActions } from "@/components/admin/discounts/discount-actions";
import { DiscountFeedbackProvider, DiscountFlash } from "@/components/admin/discounts/discount-feedback";
import { DiscountForm, type DiscountFormValues } from "@/components/admin/discounts/discount-form";
import { CheckoutIgnoresCodesNotice, NoDatabaseNotice } from "@/components/admin/discounts/discount-notices";
import {
  DiscountOrdersSection,
  DiscountOrdersSkeleton,
  DiscountUsageStats,
  DiscountUsageStatsSkeleton,
} from "@/components/admin/discounts/discount-usage";
import { AdminPageHeader, AdminSection, StatusBadge } from "@/components/admin/ui";
import { getAdminUser, requireAdminPage } from "@/lib/admin/auth";
import {
  describeDiscountRule,
  discountPath,
  discountStatusDisplay,
  DISCOUNTS_PATH,
  suggestCopyCode,
  toLagosDateTimeInput,
} from "@/lib/admin/discount-schema";
import { getDiscount, getRestrictionOptions, type DiscountDetail } from "@/lib/admin/discounts";
import { formatAdminDate, formatNumber } from "@/lib/admin/format";
import { adminMetadata } from "@/lib/admin/metadata";
import { parseListParams } from "@/lib/admin/pagination";
import { isDatabaseConfigured } from "@/lib/db";

/** Ids are cuids (or seeded slug-style ids); anything else can't be a code. */
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,191}$/;

export async function generateMetadata(props: PageProps<"/admin/discounts/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  // Only an admin's page title names the code.
  if (!ID_PATTERN.test(id) || !isDatabaseConfigured() || !(await getAdminUser())) return adminMetadata("Discount");
  const coupon = await getDiscount(id).catch(() => null);
  return adminMetadata(coupon ? `Discount ${coupon.code}` : "Discount");
}

function flashMessage(saved: string | string[] | undefined, coupon: DiscountDetail): string | null {
  const value = Array.isArray(saved) ? saved[0] : saved;
  if (value === "created") {
    return coupon.isActive
      ? `Discount ${coupon.code} created.`
      : `Discount ${coupon.code} created. It’s switched off until you switch it on.`;
  }
  if (value === "copied") {
    return `Copy created as ${coupon.code}. It’s switched off: check its dates and limits, then switch it on.`;
  }
  return null;
}

function formValues(coupon: DiscountDetail): DiscountFormValues {
  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description ?? "",
    type: coupon.type,
    percentOff: coupon.type === "PERCENTAGE" ? coupon.value : null,
    amountOff: coupon.type === "FIXED" ? coupon.value : null,
    minSubtotal: coupon.minSubtotal,
    maxDiscount: coupon.maxDiscount,
    startsAt: toLagosDateTimeInput(coupon.startsAt),
    endsAt: toLagosDateTimeInput(coupon.endsAt),
    usageLimit: coupon.usageLimit,
    perCustomerLimit: coupon.perCustomerLimit,
    categoryIds: coupon.categories.map((category) => category.id),
    productIds: coupon.products.map((product) => product.id),
    isActive: coupon.isActive,
  };
}

/**
 * /admin/discounts/[id]: one code — its status and rule, its figures, the edit
 * form with a live summary, the orders placed with it, and deleting it when no
 * order has used it. Switching it on or off and copying it sit beside the title.
 */
export default async function DiscountPage(props: PageProps<"/admin/discounts/[id]">) {
  const { id } = await props.params;
  await requireAdminPage(discountPath(id));
  if (!ID_PATTERN.test(id)) notFound();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <AdminPageHeader title="Discount" breadcrumbs={[{ label: "Discounts", href: DISCOUNTS_PATH }, { label: "Discount" }]} />
        <NoDatabaseNotice />
      </>
    );
  }

  const searchParams = await props.searchParams;
  const [coupon, options] = await Promise.all([getDiscount(id), getRestrictionOptions()]);
  if (!coupon) notFound();

  const now = new Date();
  const status = discountStatusDisplay(coupon, now);
  const rule = describeDiscountRule({
    ...coupon,
    categoryNames: coupon.categories.map((category) => category.name),
    productNames: coupon.products.map((product) => product.name),
  });
  const ordersParams = parseListParams(searchParams, { sort: ["placed"], filters: [] });
  const canDelete = coupon.orderCount === 0 && coupon.usageCount === 0;

  return (
    <DiscountFeedbackProvider>
      <DiscountFlash message={flashMessage(searchParams.saved, coupon)} clearParams={["saved"]} />

      <AdminPageHeader
        title={coupon.code}
        breadcrumbs={[{ label: "Discounts", href: DISCOUNTS_PATH }, { label: coupon.code }]}
        meta={
          <>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            <span className="text-foreground">{rule}</span>
          </>
        }
        description={
          <>
            {status.description} Created {formatAdminDate(coupon.createdAt)}.
            {coupon.description ? <span className="mt-1 block">{coupon.description}</span> : null}
          </>
        }
        actions={
          <DiscountActions
            id={coupon.id}
            code={coupon.code}
            isActive={coupon.isActive}
            suggestedCopyCode={suggestCopyCode(coupon.code)}
          />
        }
      />

      <CheckoutIgnoresCodesNotice className="mt-6" />

      <div className="mt-6">
        <Suspense fallback={<DiscountUsageStatsSkeleton />}>
          <DiscountUsageStats couponId={coupon.id} usageCount={coupon.usageCount} usageLimit={coupon.usageLimit} />
        </Suspense>
      </div>

      <div className="mt-8">
        <DiscountForm
          mode="edit"
          initial={formValues(coupon)}
          categories={options.categories}
          products={options.products}
          ordersSoFar={coupon.orderCount}
          nowIso={now.toISOString()}
        />
      </div>

      <div className="mt-10">
        <Suspense fallback={<DiscountOrdersSkeleton />}>
          <DiscountOrdersSection couponId={coupon.id} code={coupon.code} params={ordersParams} />
        </Suspense>
      </div>

      <AdminSection title="Delete discount" className="mt-10">
        {canDelete ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-body-sm text-muted-foreground">
              No order has used this code, so it can be deleted. Deleting can’t be undone.
            </p>
            <DeleteDiscountButton id={coupon.id} code={coupon.code} />
          </div>
        ) : (
          <p className="max-w-2xl text-body-sm text-muted-foreground">
            {coupon.orderCount > 0
              ? `It has been used on ${formatNumber(coupon.orderCount)} order${coupon.orderCount === 1 ? "" : "s"}, so it can’t be deleted — those orders refer to it.`
              : "An order is being placed with it right now, so it can’t be deleted."}{" "}
            {coupon.isActive
              ? "Switch it off instead to stop new orders using it."
              : "It’s switched off, so no new order can use it."}
          </p>
        )}
      </AdminSection>
    </DiscountFeedbackProvider>
  );
}

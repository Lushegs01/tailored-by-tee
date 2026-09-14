import "server-only";

import { fromDbEnum } from "@/lib/catalog/db-enums";
import { getCatalogSource } from "@/lib/catalog/sources";
import { getDb } from "@/lib/db";

import type { CouponRule } from "./discounts";

/** A stored coupon as a rule for `evaluateCoupon`. Null when unknown — or when no database is in use. */
export async function findCouponRule(code: string): Promise<CouponRule | null> {
  if (!code || getCatalogSource() !== "database") return null;

  const coupon = await getDb().coupon.findUnique({
    where: { code },
    include: { categories: { select: { categoryId: true } }, products: { select: { productId: true } } },
  });
  if (!coupon) return null;

  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description,
    type: fromDbEnum<CouponRule["type"]>(coupon.type),
    value: coupon.value,
    minSubtotal: coupon.minSubtotal,
    maxDiscount: coupon.maxDiscount,
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    usageLimit: coupon.usageLimit,
    usageCount: coupon.usageCount,
    perCustomerLimit: coupon.perCustomerLimit,
    isActive: coupon.isActive,
    categoryIds: coupon.categories.map((link) => link.categoryId),
    productIds: coupon.products.map((link) => link.productId),
  };
}

/** Orders this email has placed with the coupon (released orders give their use back). */
export async function countCouponUses(couponId: string, email: string): Promise<number> {
  return getDb().couponUsage.count({ where: { couponId, email: email.trim().toLowerCase() } });
}

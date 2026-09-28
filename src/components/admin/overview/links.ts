import type { OrderStatus } from "@/generated/prisma/enums";

/*
 * Where the overview sends the owner to act. Kept in one place so the URLs agree
 * with the list pages' filters (lib/admin/pagination's list contract):
 * - /admin/orders?status=PAID — the orders list filtered by one OrderStatus;
 * - /admin/orders/ORD-2026-001284 — an order, by its number;
 * - /admin/inventory?state=low_stock&status=ACTIVE — stock state among live products;
 * - /admin/inventory?q=TBT-KNT-KPL-SND-M — one SKU;
 * - /admin/reviews?status=PENDING — reviews waiting for approval.
 */

export const ORDERS_PATH = "/admin/orders";
export const INVENTORY_PATH = "/admin/inventory";
export const PENDING_REVIEWS_HREF = "/admin/reviews?status=PENDING";

export function ordersWithStatusHref(status: OrderStatus): string {
  return `${ORDERS_PATH}?${new URLSearchParams({ status })}`;
}

export function orderHref(number: string): string {
  return `${ORDERS_PATH}/${encodeURIComponent(number)}`;
}

/** Live products' variants that are low or sold out, least available first (the inventory list's default order). */
export function inventoryStateHref(state: "low_stock" | "out_of_stock"): string {
  return `${INVENTORY_PATH}?${new URLSearchParams({ state, status: "ACTIVE" })}`;
}

/** The inventory list searched for one SKU, where its stock can be adjusted. */
export function inventorySkuHref(sku: string): string {
  return `${INVENTORY_PATH}?${new URLSearchParams({ q: sku })}`;
}

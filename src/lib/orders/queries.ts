import "server-only";

import { findState } from "@/config/nigeria";
import { deliveryPolicy } from "@/config/policies";
import { fromDbEnum } from "@/lib/catalog/db-enums";
import { getCatalogSource } from "@/lib/catalog/sources";
import { getDb } from "@/lib/db";

import { hashOrderAccessToken } from "./access";
import type { OrderView } from "./types";

/**
 * An order, for its private link. Found by the hash of the link's secret, then
 * matched against the number in the URL; anything that doesn't line up is
 * treated as not found, so the page never confirms that an order exists.
 */
export async function getOrderByAccessKey(orderNumber: string, key: string): Promise<OrderView | null> {
  if (!key || key.length > 128 || getCatalogSource() !== "database") return null;

  const order = await getDb().order.findUnique({
    where: { accessTokenHash: hashOrderAccessToken(key) },
    include: { items: { orderBy: { id: "asc" } } },
  });
  if (!order || order.number !== orderNumber) return null;

  const zone = deliveryPolicy.zones.find((item) => item.id === order.deliveryZone);
  const method = fromDbEnum<OrderView["delivery"]["method"]>(order.deliveryMethod);

  return {
    number: order.number,
    status: fromDbEnum<OrderView["status"]>(order.status),
    paymentStatus: fromDbEnum<OrderView["paymentStatus"]>(order.paymentStatus),
    placedAt: order.createdAt.toISOString(),
    reservedUntil: order.reservedUntil?.toISOString() ?? null,
    customerName: order.customerName,
    email: order.email,
    phone: order.phone,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.productName,
      href: `/product/${item.productSlug}`,
      colorName: item.colorName,
      sizeLabel: item.sizeLabel,
      imageUrl: item.imageUrl,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    totals: {
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      shippingTotal: order.shippingTotal,
      total: order.total,
    },
    couponCode: order.couponCode,
    delivery: {
      method,
      label: method === "pickup" ? (deliveryPolicy.pickup?.name ?? "Collection") : (zone?.name ?? "Delivery"),
      estimate: order.deliveryEstimate,
      addressLines:
        method === "pickup"
          ? [deliveryPolicy.pickup?.address ?? ""].filter(Boolean)
          : [
              order.shipFullName,
              order.shipLine1,
              order.shipLine2,
              [order.shipCity, findState(order.shipState)?.name ?? order.shipState].filter(Boolean).join(", "),
              order.shipPostalCode,
            ].filter((line): line is string => Boolean(line)),
      notes: order.deliveryNotes,
    },
  };
}

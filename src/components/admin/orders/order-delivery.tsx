import { KeyValueList, type KeyValueItem } from "@/components/admin/ui";
import type { AdminOrderDetail } from "@/lib/admin/orders";

import { addressLines, deliveryLabel, deliveryZoneName, phoneForDisplay } from "./order-copy";

/*
 * Where the order is going, or where it's being collected from — as it was agreed
 * at checkout. The address is a snapshot, so a customer who later edits their
 * saved address doesn't change where this order was sent.
 */

export function OrderDelivery({ order }: { order: AdminOrderDetail }) {
  const pickup = order.deliveryMethod === "PICKUP";
  const lines = addressLines(order.deliveryMethod, {
    fullName: order.shipFullName,
    line1: order.shipLine1,
    line2: order.shipLine2,
    city: order.shipCity,
    state: order.shipState,
    postalCode: order.shipPostalCode,
  });

  const items: KeyValueItem[] = [
    { label: "Method", value: deliveryLabel(order.deliveryMethod, order.deliveryZone) },
    ...(pickup ? [] : [{ label: "Zone", value: deliveryZoneName(order.deliveryZone) }]),
    { label: pickup ? "Ready in" : "Estimate", value: order.deliveryEstimate },
    {
      label: pickup ? "Collect from" : "Address",
      value:
        lines.length > 0 ? (
          <span className="block whitespace-pre-line">{lines.join("\n")}</span>
        ) : null,
    },
    ...(pickup || !order.shipPhone
      ? []
      : [{ label: "Phone on delivery", value: phoneForDisplay(order.shipPhone) }]),
    {
      label: "Customer’s notes",
      value: order.deliveryNotes ? <span className="whitespace-pre-line">{order.deliveryNotes}</span> : null,
    },
    ...(pickup
      ? []
      : [
          { label: "Courier", value: order.carrier },
          { label: "Tracking number", value: order.trackingNumber, breakAll: true },
        ]),
  ];

  return <KeyValueList items={items} />;
}

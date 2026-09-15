import { Price } from "@/components/ui/price";
import { formatPrice } from "@/lib/format";
import type { OrderView } from "@/lib/orders/types";

/** Subtotal, discount, delivery and total, as charged when the order was placed. */
export function OrderTotals({
  order,
  paid,
}: {
  order: Pick<OrderView, "totals" | "couponCode" | "delivery">;
  /** Label the last line "Paid" rather than "Total". */
  paid: boolean;
}) {
  const { totals, delivery } = order;

  return (
    <dl className="mt-4 space-y-3 border-t pt-6 text-body-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd>
          <Price amount={totals.subtotal} />
        </dd>
      </div>
      {totals.discountTotal > 0 ? (
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
          <dd className="tabular-nums">−{formatPrice(totals.discountTotal)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">{delivery.method === "pickup" ? "Collection" : "Delivery"}</dt>
        <dd>{totals.shippingTotal === 0 ? "Free" : <Price amount={totals.shippingTotal} />}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t pt-4">
        <dt className="text-label">{paid ? "Paid" : "Total"}</dt>
        <dd className="text-lead font-medium">
          <Price amount={totals.total} />
        </dd>
      </div>
    </dl>
  );
}

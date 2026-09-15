import type { OrderView } from "@/lib/orders/types";

import { OrderItems } from "./order-items";
import { OrderContact, OrderDelivery, OrderHelp } from "./order-sections";
import { OrderTotals } from "./order-totals";

/**
 * The body of an order page — pieces and totals beside delivery, contact and help.
 * Shared by the private order link and the account, so both show an order identically.
 */
export function OrderBreakdown({ order, paid }: { order: OrderView; paid: boolean }) {
  return (
    <div className="mt-14 grid gap-y-14 border-t pt-10 md:grid-cols-12 md:gap-x-10 md:pt-12">
      <section aria-labelledby="order-pieces-heading" className="md:col-span-7">
        <h2 id="order-pieces-heading" className="text-label">
          Your pieces
        </h2>
        <OrderItems items={order.items} />
        <OrderTotals order={order} paid={paid} />
      </section>

      <div className="space-y-10 md:col-span-5">
        <OrderDelivery delivery={order.delivery} />
        <OrderContact order={order} />
        <OrderHelp orderNumber={order.number} />
      </div>
    </div>
  );
}

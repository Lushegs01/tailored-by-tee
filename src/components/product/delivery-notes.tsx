import Link from "next/link";

import { deliveryPolicy, returnsPolicy } from "@/config/policies";
import { formatPrice } from "@/lib/format";

/** Three short lines under the buttons: nearest delivery, nationwide, returns. All from config/policies. */
export function DeliveryNotes() {
  const zones = deliveryPolicy.zones;
  const home = zones[0];
  const nationwide = zones.find((zone) => zone.states === null);

  const lines = [
    home
      ? `${home.name} delivery in ${home.estimate}${home.freeOver ? `, complimentary over ${formatPrice(home.freeOver)}` : ""}.`
      : null,
    nationwide && nationwide !== home ? `Nationwide delivery in ${nationwide.estimate}.` : null,
    deliveryPolicy.pickup?.enabled ? `Or collect from the studio — ${deliveryPolicy.pickup.estimate.toLowerCase()}.` : null,
    `Returns within ${returnsPolicy.windowDays} days of delivery.`,
  ].filter(Boolean);

  return (
    <div className="mt-8 border-t pt-6">
      <ul className="space-y-2 text-body-sm text-muted-foreground">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Link href="/shipping" className="mt-4 inline-flex min-h-11 items-center text-caption text-foreground">
        <span className="link-underline-static pb-0.5">Delivery & returns</span>
      </Link>
    </div>
  );
}

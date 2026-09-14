"use client";

import * as m from "motion/react-m";

import { deliveryPolicy } from "@/config/policies";
import type { Kobo } from "@/lib/catalog/types";
import { formatPrice } from "@/lib/format";
import { DURATION, EASE_EDITORIAL } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface FreeDeliveryProgressProps {
  subtotal: Kobo;
  threshold: Kobo;
  /** Server-computed amount still needed; 0 once the order qualifies. */
  remaining: Kobo;
  /** Dims the copy while a fresh quote is on its way. */
  pending?: boolean;
  className?: string;
}

/** Where the threshold applies, named from the delivery policy (e.g. " in Lagos"). */
const freeZone = deliveryPolicy.zones.find((zone) => zone.freeOver !== null);
const whereFree = freeZone && freeZone.states !== null ? ` in ${freeZone.name}` : "";

/** A single hairline that fills in ink as the bag approaches complimentary delivery. */
export function FreeDeliveryProgress({
  subtotal,
  threshold,
  remaining,
  pending = false,
  className,
}: FreeDeliveryProgressProps) {
  const qualifies = remaining <= 0;
  const progress = qualifies ? 1 : Math.min(1, Math.max(0, subtotal / threshold));

  return (
    <div className={cn("border-b px-6 py-5", className)}>
      <p className={cn("text-body-sm transition-opacity duration-300", pending && "opacity-60")}>
        {qualifies ? (
          `Your order qualifies for complimentary delivery${whereFree}.`
        ) : (
          <>
            You are <span className="tabular-nums">{formatPrice(remaining)}</span> away from complimentary
            delivery{whereFree}.
          </>
        )}
      </p>
      <div aria-hidden="true" className="mt-3 h-px bg-border">
        <m.div
          className="h-px origin-left bg-foreground"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: progress }}
          transition={{ duration: DURATION.slow, ease: EASE_EDITORIAL }}
        />
      </div>
    </div>
  );
}

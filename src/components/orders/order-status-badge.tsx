import { cn } from "@/lib/utils";

import type { OrderStatusTone } from "./order-status";

const TONES: Record<OrderStatusTone, string> = {
  neutral: "border-border text-muted-foreground",
  positive: "border-success/40 text-success",
  attention: "border-accent-brand/40 text-accent-brand",
};

/** An order's status word in a hairline frame. Tone is carried by the word too, never by colour alone. */
export function OrderStatusBadge({
  label,
  tone,
  className,
}: {
  label: string;
  tone: OrderStatusTone;
  className?: string;
}) {
  return (
    <span className={cn("inline-block whitespace-nowrap border px-2.5 py-1 text-eyebrow", TONES[tone], className)}>
      {label}
    </span>
  );
}

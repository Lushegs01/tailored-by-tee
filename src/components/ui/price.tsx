import type { Kobo } from "@/lib/catalog/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PriceProps {
  amount: Kobo;
  compareAt?: Kobo | null;
  className?: string;
}

/** Price with optional reduced state. Tabular figures keep columns aligned. */
export function Price({ amount, compareAt, className }: PriceProps) {
  const reduced = compareAt != null && compareAt > amount;

  return (
    <span className={cn("inline-flex items-baseline gap-2 tabular-nums", className)}>
      {reduced ? <span className="sr-only">Reduced price</span> : null}
      <span>{formatPrice(amount)}</span>
      {reduced ? (
        <>
          <span className="sr-only">, originally</span>
          <s className="text-muted-foreground decoration-1">{formatPrice(compareAt)}</s>
        </>
      ) : null}
    </span>
  );
}

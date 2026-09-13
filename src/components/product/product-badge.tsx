import type { ProductBadge as ProductBadgeKind } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

export const productBadgeLabels: Record<ProductBadgeKind, string> = {
  new: "New",
  limited: "Limited",
  restocked: "Restocked",
  "online-exclusive": "Online exclusive",
};

export interface ProductBadgeProps {
  badge: ProductBadgeKind | null;
  soldOut?: boolean;
  className?: string;
}

/** Quiet status chip that sits on photography. "Sold out" outranks any merchandising badge. */
export function ProductBadge({ badge, soldOut = false, className }: ProductBadgeProps) {
  const label = soldOut ? "Sold out" : badge ? productBadgeLabels[badge] : null;
  if (!label) return null;

  return <p className={cn("bg-paper/85 backdrop-blur-md px-2.5 py-1 text-eyebrow text-ink rounded-full", className)}>{label}</p>;
}

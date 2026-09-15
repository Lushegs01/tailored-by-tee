import Link from "next/link";

import { MediaImage } from "@/components/ui/media-image";
import { Price } from "@/components/ui/price";
import type { OrderView } from "@/lib/orders/types";
import { cn } from "@/lib/utils";

/** A piece's photograph at thumbnail size, or a plain linen block when there isn't one. */
export function OrderThumbnail({ imageUrl, className }: { imageUrl: string | null; className?: string }) {
  return (
    <div className={cn("w-16 shrink-0", className)}>
      {imageUrl ? (
        <MediaImage
          image={{ src: imageUrl, width: 800, height: 1000, alt: "", color: "#ece8df" }}
          ratio="4/5"
          sizes="64px"
          quality={60}
        />
      ) : (
        <div aria-hidden="true" className="aspect-4/5 bg-surface" />
      )}
    </div>
  );
}

/** The lines of an order: photograph, name (linking to the product), options and line total. */
export function OrderItems({ items }: { items: OrderView["items"] }) {
  return (
    <ul className="mt-2 [&>li+li]:border-t">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-4 py-5">
          <OrderThumbnail imageUrl={item.imageUrl} />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-medium">
              <Link href={item.href} className="link-underline">
                {item.name}
              </Link>
            </p>
            <p className="mt-1 text-caption text-muted-foreground">
              {item.colorName} · {item.sizeLabel} · Qty {item.quantity}
            </p>
          </div>
          <Price amount={item.lineTotal} className="shrink-0 text-body-sm" />
        </li>
      ))}
    </ul>
  );
}

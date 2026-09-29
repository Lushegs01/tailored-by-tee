import Link from "next/link";

import { StatusBadge } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import type { ProductStatus } from "@/generated/prisma/enums";
import { productPath } from "@/lib/admin/product-schema";
import { productStorefrontPath } from "@/lib/admin/slug";
import { productStatusDisplay } from "@/lib/admin/status";

/*
 * The bar above a product preview.
 *
 * It says plainly that this is not the shop, because everything below it is meant
 * to look exactly like the shop. It sticks to the top so the point is never
 * scrolled away.
 */

export interface ProductPreviewBarProps {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
}

export function ProductPreviewBar({ id, name, slug, status }: ProductPreviewBarProps) {
  const display = productStatusDisplay(status);
  const live = status === "ACTIVE";

  return (
    <div className="sticky top-14 z-20 -mx-4 border-b border-foreground bg-background-raised px-4 py-3 md:-mx-8 md:px-8 lg:top-0 xl:-mx-10 xl:px-10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <h1 className="text-label">Preview — not visible to customers</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
            <span className="break-words">{name}</span>
            <StatusBadge tone={display.tone}>{display.label}</StatusBadge>
            <span>
              {live
                ? "This is how the shop shows it now."
                : "Nothing here has been published; customers can’t reach this page."}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:shrink-0 lg:justify-end">
          <Button asChild variant="outline" size="sm">
            <Link href={productPath(id)}>Back to the editor</Link>
          </Button>
          {live ? (
            <Button asChild variant="outline" size="sm">
              <a href={productStorefrontPath(slug)} target="_blank" rel="noopener">
                View in shop<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

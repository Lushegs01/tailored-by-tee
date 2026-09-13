"use client";

import Link from "next/link";
import * as React from "react";

import { MediaImage } from "@/components/ui/media-image";
import { Price } from "@/components/ui/price";
import type { ProductCardData } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

import { ColorSwatches } from "./color-swatches";
import { ProductBadge } from "./product-badge";
import { PRODUCT_CARD_SIZES } from "./product-layout";
import { QuickAdd } from "./quick-add";
import { useCanHover } from "./use-can-hover";
import { WishlistButton } from "./wishlist-button";

export interface ProductCardProps {
  product: ProductCardData;
  /** next/image sizes for the card image. */
  sizes?: string;
  /** Preload the image (first row above the fold only). */
  preload?: boolean;
  className?: string;
  /** Level for the product name; match the surrounding outline. */
  headingLevel?: "h2" | "h3" | "h4";
  /** Set false for compact contexts (e.g. search results). */
  showQuickAdd?: boolean;
  showWishlist?: boolean;
}

/** Shared by both images so the crossfade and the slow push-in move as one. */
const imageZoom = "transition-transform duration-1200 ease-editorial group-hover/card:scale-[1.03]";

/**
 * The storefront's most repeated element: image, name, price, colours — nothing else.
 *
 * Structure: the image, meta and controls share one grid so the controls can sit
 * over the photograph while coming last in the DOM. Tab order is therefore
 * name link → wishlist → quick add. The name link's ::after stretches over the
 * whole card (one primary link); the controls layer above it as their own tab stops.
 */
export function ProductCard({
  product,
  sizes = PRODUCT_CARD_SIZES,
  preload = false,
  className,
  headingLevel: Heading = "h3",
  showQuickAdd = true,
  showWishlist = true,
}: ProductCardProps) {
  const headingId = React.useId();
  // Touch devices never see the alternate shot, so they never download it.
  const canHover = useCanHover();
  const { isSoldOut } = product;
  const quickAdd = showQuickAdd && !isSoldOut ? product.quickAdd : null;

  return (
    <article aria-labelledby={headingId} className={cn("group/card relative isolate grid grid-cols-1", className)}>
      <div className="relative col-start-1 row-start-1 overflow-hidden bg-surface">
        <MediaImage
          image={product.image}
          sizes={sizes}
          ratio="4/5"
          preload={preload}
          className={cn(isSoldOut && "opacity-80")}
          imageClassName={imageZoom}
        />
        {canHover && product.hoverImage ? (
          <MediaImage
            image={product.hoverImage}
            sizes={sizes}
            ratio={null}
            alt=""
            className={cn(
              "absolute inset-0 opacity-0 transition-opacity duration-700 ease-editorial group-hover/card:opacity-100",
              isSoldOut && "group-hover/card:opacity-80",
            )}
            imageClassName={imageZoom}
          />
        ) : null}
        <ProductBadge badge={product.badge} soldOut={isSoldOut} className="absolute top-2.5 left-2.5" />
      </div>

      {/* Stacks name over price on narrow cards (2-up phones) so names aren't clipped to a stub. */}
      <div className="@container col-start-1 row-start-2 pt-3">
        <div className="flex flex-col @min-[13rem]:flex-row @min-[13rem]:items-baseline @min-[13rem]:justify-between @min-[13rem]:gap-3">
          <Heading id={headingId} className="min-w-0 truncate text-body-sm font-medium">
            <Link href={product.href} className="link-underline after:absolute after:inset-0">
              {product.name}
            </Link>
          </Heading>
          <Price amount={product.price} compareAt={product.compareAtPrice} className="shrink-0 text-body-sm" />
        </div>
        <ColorSwatches colors={product.colors} className="mt-1" />
      </div>

      {showWishlist || quickAdd ? (
        <div className="pointer-events-none relative z-10 col-start-1 row-start-1 overflow-hidden">
          {showWishlist ? (
            <WishlistButton productId={product.id} productName={product.name} className="absolute top-0 right-0" />
          ) : null}
          {quickAdd ? <QuickAdd product={product} option={quickAdd} /> : null}
        </div>
      ) : null}
    </article>
  );
}

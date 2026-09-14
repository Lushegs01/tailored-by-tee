import { RevealGroup, RevealItem } from "@/components/motion/reveal";
import type { ProductCardData } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

import { ProductCard } from "./product-card";
import { productGridClassName, productGridSizes } from "./product-layout";

export interface ProductGridProps {
  products: ProductCardData[];
  /** Desktop column count. Mobile is always 2. */
  columns?: 3 | 4;
  /** How many leading cards preload their image. */
  preloadCount?: number;
  className?: string;
  /** Level for each product name; match the surrounding outline. */
  headingLevel?: "h2" | "h3" | "h4";
  /** Overrides the image `sizes` hint when the grid sits beside other content (e.g. a filter rail). */
  sizes?: string;
  /**
   * Stagger cards in as the grid scrolls into view. Turn off on listings that
   * re-render in place (filters, sort) so results simply appear.
   */
  animate?: boolean;
}

/**
 * Server-compatible product grid. Cards stagger in as the grid enters the viewport —
 * except the leading preloaded cards, which sit above the fold and paint immediately.
 */
export function ProductGrid({
  products,
  columns = 4,
  preloadCount = 0,
  className,
  headingLevel,
  sizes: sizesOverride,
  animate = true,
}: ProductGridProps) {
  if (products.length === 0) return null;

  const sizes = sizesOverride ?? productGridSizes(columns);
  const gridClassName = cn(productGridClassName(columns), className);

  if (!animate) {
    return (
      <ul className={gridClassName}>
        {products.map((product, index) => (
          <li key={product.id}>
            <ProductCard product={product} sizes={sizes} preload={index < preloadCount} headingLevel={headingLevel} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <RevealGroup as="ul" className={gridClassName}>
      {products.map((product, index) => {
        const preload = index < preloadCount;
        const card = <ProductCard product={product} sizes={sizes} preload={preload} headingLevel={headingLevel} />;

        return preload ? (
          <li key={product.id}>{card}</li>
        ) : (
          <RevealItem key={product.id} as="li">
            {card}
          </RevealItem>
        );
      })}
    </RevealGroup>
  );
}

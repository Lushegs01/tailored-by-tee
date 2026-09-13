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
}

/**
 * Server-compatible product grid. Cards stagger in as the grid enters the viewport —
 * except the leading preloaded cards, which sit above the fold and paint immediately.
 */
export function ProductGrid({ products, columns = 4, preloadCount = 0, className, headingLevel }: ProductGridProps) {
  if (products.length === 0) return null;

  const sizes = productGridSizes(columns);

  return (
    <RevealGroup as="ul" className={cn(productGridClassName(columns), className)}>
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

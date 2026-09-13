"use client";

import Link from "next/link";

import { MediaImage } from "@/components/ui/media-image";
import { Price } from "@/components/ui/price";
import type { ProductCardData } from "@/lib/catalog/types";

import { SEARCH_ITEM_ATTR } from "./search-keyboard";

export interface SearchProductResultProps {
  product: ProductCardData;
  /** Runs on any activation (records the search). */
  onPick: () => void;
  /** Runs on client-side navigation only (closes the overlay). */
  onNavigate: () => void;
}

/** Compact result row: 4:5 thumbnail, category, name and price. */
export function SearchProductResult({ product, onPick, onNavigate }: SearchProductResultProps) {
  return (
    <Link
      href={product.href}
      prefetch={false}
      onClick={onPick}
      onNavigate={onNavigate}
      {...{ [SEARCH_ITEM_ATTR]: "" }}
      className="group/result -mx-2 flex items-center gap-4 p-2 transition-colors duration-300 ease-editorial hover:bg-surface focus-visible:bg-surface md:gap-5"
    >
      <MediaImage
        image={product.image}
        alt=""
        ratio="4/5"
        sizes="(min-width: 768px) 80px, 64px"
        quality={60}
        className="w-16 shrink-0 md:w-20"
        imageClassName="transition-transform duration-700 ease-editorial group-hover/result:scale-[1.03]"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-caption text-muted-foreground">{product.category.name}</span>
        <span className="line-clamp-2 text-body-sm text-foreground">{product.name}</span>
        <span className="flex flex-wrap items-baseline gap-x-3 text-body-sm text-foreground">
          <Price amount={product.price} compareAt={product.compareAtPrice} />
          {product.isSoldOut ? <span className="text-caption text-muted-foreground">Sold out</span> : null}
        </span>
      </span>
    </Link>
  );
}

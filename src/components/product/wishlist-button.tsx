"use client";

import { HeartIcon } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import { cn } from "@/lib/utils";

import { revealOnIntent } from "./product-layout";

export interface WishlistButtonProps {
  productId: string;
  productName: string;
  /**
   * "overlay" (default): a paper chip for use on photography inside a product card —
   * revealed on card hover on pointer devices, always shown once saved.
   * "inline": a plain icon for page chrome, e.g. beside the add-to-bag button.
   */
  variant?: "overlay" | "inline";
  className?: string;
}

/** Save-for-later toggle. aria-pressed carries the state; the label names the action. */
export function WishlistButton({ productId, productName, variant = "overlay", className }: WishlistButtonProps) {
  const wishlist = useWishlist();
  const saved = wishlist.has(productId);
  const label = saved ? `Remove ${productName} from your wishlist` : `Save ${productName} to your wishlist`;
  const toggle = () => wishlist.toggle(productId);

  if (variant === "inline") {
    return (
      <IconButton label={label} aria-pressed={saved} onClick={toggle} className={className}>
        <HeartIcon filled={saved} />
      </IconButton>
    );
  }

  return (
    // Reveal lives on a wrapper so it never fights IconButton's own hover dimming.
    <div className={cn("pointer-events-auto", !saved && revealOnIntent, className)}>
      <IconButton
        label={label}
        aria-pressed={saved}
        onClick={toggle}
        // Focus ring drawn on the chip's edge rather than around the 44px hit area.
        className="text-ink focus-visible:-outline-offset-[11.5px]"
      >
        <span className="grid size-6 place-items-center bg-paper/90 text-[0.875rem]">
          <HeartIcon filled={saved} />
        </span>
      </IconButton>
    </div>
  );
}

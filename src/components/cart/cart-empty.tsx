import type { Ref } from "react";

import { TextLink } from "@/components/ui/text-link";

export interface CartEmptyProps {
  /** Shown as a link to the wishlist when above zero. */
  wishlistCount?: number;
  /** Called when a link is followed, to close the drawer. */
  onNavigate?: () => void;
  /** Focus target after the last line is removed. */
  headingRef?: Ref<HTMLHeadingElement>;
}

/** Quiet empty bag: a serif line and a couple of ways back into the collection. */
export function CartEmpty({ wishlistCount = 0, onNavigate, headingRef }: CartEmptyProps) {
  return (
    <div className="flex flex-1 flex-col px-6 pb-8 pt-14">
      <h3 ref={headingRef} tabIndex={-1} className="font-display text-display-xs outline-none">
        Your bag is empty.
      </h3>
      <p className="mt-3 text-body-sm text-muted-foreground">Pieces you add will be kept here.</p>

      <ul className="mt-10 flex flex-col items-start gap-1">
        <li>
          <TextLink href="/shop/new-arrivals" onClick={onNavigate} className="min-h-11">
            Shop new arrivals
          </TextLink>
        </li>
        <li>
          <TextLink href="/collections" onClick={onNavigate} className="min-h-11">
            Explore collections
          </TextLink>
        </li>
      </ul>

      {wishlistCount > 0 ? (
        <div className="mt-auto border-t pt-5">
          <TextLink href="/wishlist" variant="underline" onClick={onNavigate} className="min-h-11">
            View your wishlist ({wishlistCount})
          </TextLink>
        </div>
      ) : null}
    </div>
  );
}

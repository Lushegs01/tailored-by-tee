"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useCart } from "@/components/cart/cart-provider";
import { QuantityStepper } from "@/components/cart/quantity-stepper";
import { HeartIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import type { SizeGuide } from "@/config/size-guides";
import {
  findVariant,
  initialColorId,
  initialSizeId,
  isSoldOut,
  sizeStates,
  type ProductPurchaseOptions,
  type PurchaseVariant,
} from "@/lib/catalog/purchase";
import { cn } from "@/lib/utils";

import { SizeGuideDialog } from "./size-guide-dialog";
import { SoldOutStrike } from "./sold-out-strike";

export interface ProductPurchaseProps {
  options: ProductPurchaseOptions;
  sizeGuide: SizeGuide | null;
  /** Server-rendered delivery and returns notes, shown under the buttons. */
  delivery?: React.ReactNode;
}

/**
 * Colour, size, quantity and the buttons that act on them. Unavailable
 * combinations are disabled and crossed through, with a line saying why; the bag
 * only ever receives a variant id and a quantity, re-checked by the server quote.
 */
export function ProductPurchase({ options, sizeGuide, delivery }: ProductPurchaseProps) {
  const cart = useCart();
  const wishlist = useWishlist();
  const router = useRouter();
  const ids = React.useId();

  const [colorId, setColorId] = React.useState(() => initialColorId(options));
  const [sizeId, setSizeId] = React.useState(() => initialSizeId(options));
  const [quantity, setQuantity] = React.useState(1);
  const [needsSize, setNeedsSize] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  const sizeFieldRef = React.useRef<HTMLFieldSetElement>(null);
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const showBar = useStickyBar(actionsRef);

  const oneSize = options.sizes.length === 1;
  const soldOut = isSoldOut(options);
  const color = options.colors.find((item) => item.id === colorId) ?? null;
  const sizes = colorId ? sizeStates(options, colorId) : [];
  const size = options.sizes.find((item) => item.id === sizeId) ?? null;
  const variant = colorId && sizeId ? findVariant(options, colorId, sizeId) : null;
  const purchasable = variant !== null && variant.maxQuantity > 0;
  const maxQuantity = purchasable ? variant.maxQuantity : 1;
  const safeQuantity = Math.min(quantity, maxQuantity);
  const label = [options.name, color?.name, oneSize ? null : size?.label].filter(Boolean).join(", ");
  const saved = wishlist.has(options.productId);
  const hasSoldOutSize = sizes.some((item) => !item.available);
  const photographedColor =
    options.photographedColorId && options.photographedColorId !== colorId
      ? options.colors.find((item) => item.id === options.photographedColorId)
      : null;

  function selectColor(nextId: string) {
    setColorId(nextId);
    const nextColor = options.colors.find((item) => item.id === nextId);
    // Keep the chosen size when this colour has it; otherwise say so rather than silently dropping it.
    if (sizeId && !oneSize) {
      const next = findVariant(options, nextId, sizeId);
      if (!next || next.maxQuantity === 0) {
        setNotice(`${size?.label ?? "That size"} is sold out in ${nextColor?.name ?? "this colour"} — choose another size.`);
        setSizeId(null);
        return;
      }
    }
    setNotice(null);
  }

  function selectSize(nextId: string) {
    setSizeId(nextId);
    setNeedsSize(false);
    setNotice(null);
  }

  /** The variant to act on, or null after prompting for whatever is missing. */
  function resolveVariant(): PurchaseVariant | null {
    if (!sizeId) {
      setNeedsSize(true);
      const field = sizeFieldRef.current;
      field?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
      field?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus({ preventScroll: true });
      return null;
    }
    return purchasable ? variant : null;
  }

  function addToBag() {
    const target = resolveVariant();
    if (target) cart.addItem(target.id, safeQuantity, { label });
  }

  function buyNow() {
    const target = resolveVariant();
    if (!target) return;
    cart.addItem(target.id, safeQuantity, { label, openDrawer: false });
    router.push("/checkout");
  }

  const statusMessage = needsSize
    ? "Select a size to continue."
    : (notice ??
      (variant?.lowStockRemaining ? `Only ${variant.lowStockRemaining} left in ${size?.label ?? "this size"}.` : null));

  return (
    <div>
      {/* Colour */}
      <fieldset className="mt-8">
        <legend className="text-label">
          Colour
          <span className="ml-2 text-body-sm font-normal tracking-normal normal-case text-muted-foreground">
            {color?.name}
            {color && !color.available ? " — sold out" : ""}
          </span>
        </legend>
        <div className="mt-2 -ml-2 flex flex-wrap">
          {options.colors.map((item) => (
            <label key={item.id} title={item.name} className="relative grid size-11 cursor-pointer place-items-center">
              <input
                type="radio"
                name={`${ids}-colour`}
                value={item.id}
                checked={item.id === colorId}
                onChange={() => selectColor(item.id)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="relative size-7 rounded-full ring-1 ring-foreground/15 ring-inset outline-offset-[3px] peer-checked:outline-1 peer-checked:outline-foreground peer-checked:outline-solid peer-focus-visible:outline-[1.5px] peer-focus-visible:outline-ring peer-focus-visible:outline-solid"
                style={{ backgroundColor: item.hex }}
              >
                {item.available ? null : <SoldOutStrike className="text-foreground/70" />}
              </span>
              <span className="sr-only">
                {item.name}
                {item.available ? "" : ", sold out"}
              </span>
            </label>
          ))}
        </div>
        {photographedColor ? (
          <p className="mt-1 text-caption text-muted-foreground">Photographed in {photographedColor.name}.</p>
        ) : null}
      </fieldset>

      {/* Size */}
      {oneSize ? (
        <p className="mt-7 text-body-sm text-muted-foreground">One size</p>
      ) : (
        <fieldset ref={sizeFieldRef} className="mt-7" aria-describedby={statusMessage ? `${ids}-status` : undefined}>
          <legend className="float-left flex min-h-11 items-center text-label">Size</legend>
          {sizeGuide ? (
            <div className="flex justify-end">
              <SizeGuideDialog guide={sizeGuide} />
            </div>
          ) : null}
          <div className="clear-both grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2 pt-1">
            {sizes.map((item) => (
              <label
                key={item.id}
                className={cn(
                  "relative flex h-12 items-center justify-center border text-body-sm tabular-nums",
                  "transition-colors duration-300 ease-editorial",
                  "has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background",
                  "has-[:focus-visible]:outline-[1.5px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid",
                  item.available
                    ? "cursor-pointer border-border-strong hover:border-foreground"
                    : "cursor-not-allowed border-border text-muted-foreground",
                  needsSize && item.available && "border-danger",
                )}
              >
                <input
                  type="radio"
                  name={`${ids}-size`}
                  value={item.id}
                  checked={item.id === sizeId}
                  disabled={!item.available}
                  onChange={() => selectSize(item.id)}
                  className="sr-only"
                />
                {item.label}
                {item.available ? null : (
                  <>
                    <span className="sr-only">, sold out in {color?.name}</span>
                    <SoldOutStrike className="opacity-40" />
                  </>
                )}
              </label>
            ))}
          </div>
          {hasSoldOutSize ? (
            <p className="mt-3 text-caption text-muted-foreground">
              Crossed-through sizes are sold out in {color?.name}.
            </p>
          ) : null}
        </fieldset>
      )}

      <p
        id={`${ids}-status`}
        role={needsSize ? "alert" : "status"}
        className={cn("mt-3 min-h-5 text-caption", needsSize ? "text-danger" : "text-foreground")}
      >
        {statusMessage}
      </p>

      {options.fit || options.modelNote ? (
        <p className="mt-2 text-caption text-muted-foreground">
          {[options.fit ? `${options.fit}.` : null, options.modelNote].filter(Boolean).join(" ")}
        </p>
      ) : null}

      {/* Actions */}
      <div ref={actionsRef} className="mt-7 flex flex-col gap-3">
        <div className="flex gap-3">
          {soldOut ? null : (
            <QuantityStepper
              value={safeQuantity}
              max={maxQuantity}
              label={label}
              onChange={setQuantity}
              className="h-12 shrink-0"
            />
          )}
          <Button onClick={addToBag} disabled={soldOut} className="flex-1">
            {soldOut ? "Sold out" : "Add to bag"}
          </Button>
        </div>
        {soldOut ? null : (
          <Button variant="outline" fullWidth onClick={buyNow}>
            Buy now
          </Button>
        )}
        <button
          type="button"
          aria-pressed={saved}
          onClick={() => wishlist.toggle(options.productId)}
          className="inline-flex min-h-11 items-center justify-center gap-2.5 text-label transition-opacity duration-300 hover:opacity-60"
        >
          <HeartIcon filled={saved} aria-hidden="true" className="text-base" />
          {saved ? "Saved to wishlist" : "Save to wishlist"}
        </button>
      </div>

      {delivery}

      {/* Phones: a slim bar once the buttons have scrolled away; hidden again at the footer. */}
      {soldOut ? null : (
        <div
          aria-hidden={!showBar}
          inert={!showBar}
          className={cn(
            "fixed inset-x-0 bottom-0 z-30 border-t bg-background px-(--gutter) pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden",
            "transition-transform duration-500 ease-editorial",
            showBar ? "translate-y-0" : "translate-y-full",
          )}
        >
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-medium">{options.name}</p>
              <p className="flex items-baseline gap-2 text-caption text-muted-foreground">
                <Price amount={variant?.price ?? options.price} compareAt={options.compareAtPrice} />
                {size && !oneSize ? <span>· {size.label}</span> : null}
              </p>
            </div>
            <Button size="sm" onClick={addToBag}>
              {sizeId ? "Add to bag" : "Select size"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * True once `target` has scrolled up out of view, until the page footer comes into view.
 *
 * Measured on scroll (one reading per frame) rather than with IntersectionObserver:
 * an observer only reports threshold crossings, so a jump straight past the
 * buttons — a flick, the End key, restored scroll on back-navigation — never fires.
 */
function useStickyBar(target: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const element = target.current;
    if (!element) return;
    const footer = document.querySelector("body > footer");
    let frame = 0;

    const measure = () => {
      frame = 0;
      const passed = element.getBoundingClientRect().bottom < 0;
      const atFooter = footer !== null && footer.getBoundingClientRect().top < window.innerHeight;
      setVisible(passed && !atFooter);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [target]);

  return visible;
}

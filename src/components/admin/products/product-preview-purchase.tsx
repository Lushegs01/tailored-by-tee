import { SoldOutStrike } from "@/components/product/sold-out-strike";
import {
  initialColorId,
  isSoldOut,
  sizeStates,
  type ProductPurchaseOptions,
} from "@/lib/catalog/purchase";
import { cn } from "@/lib/utils";

/*
 * The colour and size panel, as customers see it — but still.
 *
 * The shop's own ProductPurchase can't render here: it reads the bag and the
 * wishlist from providers that belong to the storefront, and an admin preview
 * must never be able to put something in a customer's bag. This is a faithful
 * copy of its layout and wording, built from exactly the same
 * buildPurchaseOptions data, with the controls fixed on the colour the page
 * would open on and the buttons shown but inert.
 */

export interface ProductPreviewPurchaseProps {
  options: ProductPurchaseOptions;
  /** A size guide exists for this category and size system. */
  hasSizeGuide: boolean;
}

export function ProductPreviewPurchase({ options, hasSizeGuide }: ProductPreviewPurchaseProps) {
  const colorId = initialColorId(options);
  const color = options.colors.find((item) => item.id === colorId) ?? null;
  const sizes = colorId ? sizeStates(options, colorId) : [];
  const oneSize = options.sizes.length === 1;
  const soldOut = isSoldOut(options);
  const hasSoldOutSize = sizes.some((item) => !item.available);
  const photographedColor =
    options.photographedColorId && options.photographedColorId !== colorId
      ? options.colors.find((item) => item.id === options.photographedColorId)
      : null;

  return (
    <div>
      {/* Colour */}
      <div className="mt-8">
        <p className="text-label">
          Colour
          <span className="ml-2 text-body-sm font-normal tracking-normal normal-case text-muted-foreground">
            {color?.name ?? "None added yet"}
            {color && !color.available ? " — sold out" : ""}
          </span>
        </p>
        {options.colors.length > 0 ? (
          <div className="mt-2 -ml-2 flex flex-wrap">
            {options.colors.map((item) => (
              <span key={item.id} title={item.name} className="relative grid size-11 place-items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative size-7 rounded-full ring-1 ring-foreground/15 ring-inset outline-offset-[3px]",
                    item.id === colorId && "outline-1 outline-foreground outline-solid",
                  )}
                  style={{ backgroundColor: item.hex }}
                >
                  {item.available ? null : <SoldOutStrike className="text-foreground/70" />}
                </span>
                <span className="sr-only">
                  {item.name}
                  {item.available ? "" : ", sold out"}
                  {item.id === colorId ? ", the colour the page opens on" : ""}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-body-sm text-muted-foreground">
            No colours yet, so there is nothing for a customer to choose.
          </p>
        )}
        {photographedColor ? (
          <p className="mt-1 text-caption text-muted-foreground">Photographed in {photographedColor.name}.</p>
        ) : null}
      </div>

      {/* Size */}
      {oneSize ? (
        <p className="mt-7 text-body-sm text-muted-foreground">One size</p>
      ) : (
        <div className="mt-7">
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4">
            <p className="text-label">Size</p>
            {hasSizeGuide ? <p className="text-body-sm text-muted-foreground">Size guide</p> : null}
          </div>
          {sizes.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2 pt-1">
              {sizes.map((item) => (
                <span
                  key={item.id}
                  className={cn(
                    "relative flex h-12 items-center justify-center border text-body-sm tabular-nums",
                    item.available ? "border-border-strong" : "border-border text-muted-foreground",
                  )}
                >
                  {item.label}
                  {item.available ? null : (
                    <>
                      <span className="sr-only">, sold out in {color?.name}</span>
                      <SoldOutStrike className="opacity-40" />
                    </>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="pt-1 text-body-sm text-muted-foreground">
              No sizes yet, so there is nothing for a customer to choose.
            </p>
          )}
          {hasSoldOutSize ? (
            <p className="mt-3 text-caption text-muted-foreground">
              Crossed-through sizes are sold out in {color?.name}.
            </p>
          ) : null}
        </div>
      )}

      {options.fit || options.modelNote ? (
        <p className="mt-5 text-caption text-muted-foreground">
          {[options.fit ? `${options.fit}.` : null, options.modelNote].filter(Boolean).join(" ")}
        </p>
      ) : null}

      {/* Buttons, shown but inert. */}
      <div className="mt-7 flex flex-col gap-3">
        <div className="flex h-12 items-center justify-center border border-foreground bg-foreground text-label text-background">
          {soldOut ? "Sold out" : "Add to bag"}
        </div>
        {soldOut ? null : (
          <div className="flex h-12 items-center justify-center border border-foreground/60 text-label">Buy now</div>
        )}
      </div>

      <p className="mt-4 text-caption text-muted-foreground">
        These controls don’t work in a preview: nothing here can be added to a bag or a wish list. The colour shown
        is the one the page would open on.
      </p>
    </div>
  );
}

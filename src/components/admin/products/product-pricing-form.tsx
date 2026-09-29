"use client";

import { useState } from "react";

import { saveProductPricing } from "@/app/admin/products/actions";
import { MoneyField } from "@/components/admin/ui";
import { formatKobo, koboToNairaInput, parseNairaToKobo } from "@/lib/admin/format";

import { COMPARE_AT_HINT, PRICE_HINT } from "./product-copy";
import { ProductSectionForm } from "./product-section-form";

export interface ProductPricingFormProps {
  id: string;
  updatedAt: string;
  price: number;
  compareAtPrice: number | null;
  /** How many variants carry a price of their own, which overrides this one. */
  overriddenVariantCount: number;
}

/**
 * "Pricing": what a customer pays, and — when the piece is reduced — what it used
 * to cost. The saving is worked out as the owner types, and the original price is
 * checked against the price here and again on the server.
 */
export function ProductPricingForm({
  id,
  updatedAt,
  price,
  compareAtPrice,
  overriddenVariantCount,
}: ProductPricingFormProps) {
  const [priceText, setPriceText] = useState(() => koboToNairaInput(price));
  const [compareText, setCompareText] = useState(() => koboToNairaInput(compareAtPrice));

  const priceKobo = parseNairaToKobo(priceText);
  const compareKobo = compareText.trim() === "" ? null : parseNairaToKobo(compareText);

  const reduced = priceKobo !== null && compareKobo !== null && compareKobo > priceKobo;
  const invalidCompare = priceKobo !== null && compareKobo !== null && compareKobo <= priceKobo;
  const saving = reduced && compareKobo !== null && priceKobo !== null ? compareKobo - priceKobo : 0;
  const percent = reduced && compareKobo ? Math.round((saving / compareKobo) * 100) : 0;

  return (
    <ProductSectionForm
      id={id}
      updatedAt={updatedAt}
      action={saveProductPricing}
      anchor="pricing"
      title="Pricing"
      description="Prices are in naira. Everything the shop shows and charges is worked out from the price here."
      saveLabel="Save pricing"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <MoneyField
          name="price"
          label="Price"
          defaultKobo={price}
          onChange={(event) => setPriceText(event.target.value)}
          required
          hint={PRICE_HINT}
        />

        <MoneyField
          name="compareAtPrice"
          label="Original price"
          optional
          defaultKobo={compareAtPrice}
          onChange={(event) => setCompareText(event.target.value)}
          hint={
            <>
              Shown crossed out beside the price when the piece is on sale. {COMPARE_AT_HINT}
            </>
          }
        />

        <p className="text-body-sm md:col-span-2" role="status">
          {reduced ? (
            <>
              Customers will see{" "}
              <span className="tabular-nums">{formatKobo(priceKobo ?? 0)}</span> with{" "}
              <s className="text-muted-foreground decoration-1 tabular-nums">{formatKobo(compareKobo ?? 0)}</s>{" "}
              crossed out beside it — a saving of{" "}
              <span className="tabular-nums">{formatKobo(saving)}</span>
              {percent > 0 ? `, about ${percent}% off` : ""}.
            </>
          ) : invalidCompare ? (
            <span className="text-danger">
              The original price must be higher than the price, or left empty. Nothing is crossed out unless the
              piece is reduced.
            </span>
          ) : (
            <span className="text-muted-foreground">
              The piece isn’t on sale: customers see one price, with nothing crossed out.
            </span>
          )}
        </p>

        {overriddenVariantCount > 0 ? (
          <p className="text-caption text-muted-foreground md:col-span-2">
            {overriddenVariantCount === 1
              ? "One variant has a price of its own, which is charged instead of this one."
              : `${overriddenVariantCount} variants have prices of their own, which are charged instead of this one.`}{" "}
            Those are under “Variants and stock”.
          </p>
        ) : null}
      </div>
    </ProductSectionForm>
  );
}

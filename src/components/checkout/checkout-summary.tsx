"use client";

import * as React from "react";

import type { ClientCheckoutQuote } from "@/app/checkout/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaImage } from "@/components/ui/media-image";
import { Price } from "@/components/ui/price";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CheckoutSummaryProps {
  quote: ClientCheckoutQuote | null;
  pending: boolean;
  error: string | null;
  onRetry: () => void;
  /** How many lines the bag holds, for the skeleton before the first quote. */
  lineCount: number;
  /** The code the shopper asked for; the quote says whether it applies. */
  requestedCode: string | null;
  onApplyCode: (code: string) => void;
  onRemoveCode: () => void;
  deliveryMethod: "delivery" | "pickup";
  /** Summary rendered twice (mobile disclosure, desktop column); ids must differ. */
  idPrefix: string;
}

/** The server-priced order: pieces, discount code, and the totals that will be charged. */
export function CheckoutSummary({
  quote,
  pending,
  error,
  onRetry,
  lineCount,
  requestedCode,
  onApplyCode,
  onRemoveCode,
  deliveryMethod,
  idPrefix,
}: CheckoutSummaryProps) {
  const lines = quote?.cart.lines ?? [];
  const delivery = quote?.delivery ?? null;
  const dim = cn("transition-opacity duration-300", pending && "opacity-50");

  return (
    <div aria-busy={pending || undefined}>
      {error ? (
        <div className="mb-5 flex items-center justify-between gap-4 border py-1 pr-3 pl-4">
          <p className="py-2.5 text-body-sm">{error}</p>
          <button type="button" onClick={onRetry} className="inline-flex min-h-11 shrink-0 items-center text-label">
            <span className="link-underline-static pb-1">Try again</span>
          </button>
        </div>
      ) : null}

      {quote ? (
        <ul aria-label="Pieces in this order" className={cn("[&>li+li]:border-t", dim)}>
          {lines.map((line) => (
            <li key={line.variantId} className="flex items-start gap-4 py-4">
              <div className="relative w-14 shrink-0">
                <MediaImage image={line.image} ratio="4/5" sizes="56px" quality={60} alt="" />
                <span
                  aria-hidden="true"
                  className="absolute -top-2 -right-2 grid size-5 place-items-center bg-foreground text-micro tabular-nums text-background"
                >
                  {line.quantity}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-medium">{line.name}</p>
                <p className="mt-0.5 text-caption text-muted-foreground">
                  {line.colorName} · {line.sizeLabel}
                  <span className="sr-only">, quantity {line.quantity}</span>
                </p>
              </div>
              <Price amount={line.lineTotal} className="shrink-0 text-body-sm" />
            </li>
          ))}
        </ul>
      ) : (
        <ul aria-hidden="true">
          {Array.from({ length: Math.max(1, lineCount) }, (_, index) => (
            <li key={index} className="flex items-center gap-4 py-4">
              <Skeleton className="aspect-4/5 w-14" />
              <div className="flex-1">
                <Skeleton className="h-2.5 w-3/5" />
                <Skeleton className="mt-2 h-2 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {quote && quote.cart.issues.length > 0 ? (
        <div className="mt-2 border px-4 py-3">
          <p className="text-eyebrow text-muted-foreground">Your bag has been updated</p>
          <ul className="mt-2 space-y-1 text-body-sm">
            {quote.cart.issues.map((issue) => (
              <li key={`${issue.variantId}:${issue.kind}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <DiscountCode
        idPrefix={idPrefix}
        requestedCode={requestedCode}
        applied={quote?.coupon ?? null}
        error={requestedCode && !pending ? (quote?.couponError ?? null) : null}
        onApply={onApplyCode}
        onRemove={onRemoveCode}
      />

      <dl className={cn("mt-6 space-y-3 border-t pt-6 text-body-sm", dim)}>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd>{quote ? <Price amount={quote.totals.subtotal} /> : <Skeleton className="h-3 w-16" />}</dd>
        </div>
        {quote && quote.totals.discountTotal > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Discount{quote.coupon ? ` (${quote.coupon.code})` : ""}</dt>
            <dd className="tabular-nums">−{formatPrice(quote.totals.discountTotal)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{deliveryMethod === "pickup" ? "Collection" : "Delivery"}</dt>
          <dd className="text-right">
            {!quote ? (
              <Skeleton className="h-3 w-16" />
            ) : delivery ? (
              delivery.fee === 0 ? (
                "Free"
              ) : (
                <Price amount={delivery.fee} />
              )
            ) : (
              <span className="text-muted-foreground">Choose a state</span>
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t pt-4">
          <dt className="text-label">Total</dt>
          <dd className="text-lead font-medium">
            {quote ? <Price amount={quote.totals.total} /> : <Skeleton className="h-4 w-24" />}
          </dd>
        </div>
      </dl>

      {delivery?.amountToFree ? (
        <p className="mt-4 text-caption text-muted-foreground">
          Add {formatPrice(delivery.amountToFree)} more for complimentary delivery to {delivery.label}.
        </p>
      ) : null}
    </div>
  );
}

function DiscountCode({
  idPrefix,
  requestedCode,
  applied,
  error,
  onApply,
  onRemove,
}: {
  idPrefix: string;
  requestedCode: string | null;
  applied: ClientCheckoutQuote["coupon"];
  error: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const [value, setValue] = React.useState(requestedCode ?? "");
  const inputId = `${idPrefix}-discount-code`;

  if (applied) {
    return (
      <div className="mt-4 flex items-center justify-between gap-4 border-t pt-4">
        <p className="text-body-sm">
          <span className="text-muted-foreground">Code </span>
          <span className="font-medium tracking-wide">{applied.code}</span>
          <span className="text-muted-foreground"> applied</span>
        </p>
        <button
          type="button"
          onClick={() => {
            setValue("");
            onRemove();
          }}
          className="inline-flex min-h-11 items-center text-caption"
        >
          <span className="link-underline-static pb-0.5">Remove</span>
        </button>
      </div>
    );
  }

  const apply = () => {
    const code = value.trim();
    if (code) onApply(code);
  };

  return (
    <div className="mt-4 border-t pt-4">
      <label htmlFor={inputId} className="mb-2 block text-body-sm font-medium">
        Discount code
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // Enter applies the code instead of submitting the whole checkout.
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="uppercase placeholder:normal-case"
          placeholder="Enter a code"
        />
        <Button type="button" variant="outline" onClick={apply} disabled={!value.trim()} className="shrink-0">
          Apply
        </Button>
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-2 text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

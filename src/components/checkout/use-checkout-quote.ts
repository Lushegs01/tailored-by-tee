"use client";

import * as React from "react";

import { getCheckoutQuote, type ClientCheckoutQuote } from "@/app/checkout/actions";
import type { CartLineInput } from "@/lib/catalog/types";
import type { DeliveryMethod } from "@/lib/commerce/delivery";

export interface CheckoutQuoteRequest {
  lines: CartLineInput[];
  deliveryMethod: DeliveryMethod;
  stateCode: string | null;
  couponCode: string | null;
  email: string | null;
}

/**
 * The server's price for the checkout as it stands, refreshed (debounced) whenever
 * anything that affects it changes. The last answer stays on screen while the next
 * is on its way, marked pending, so totals never blink to nothing.
 */
export function useCheckoutQuote(request: CheckoutQuoteRequest) {
  const key = JSON.stringify(request);
  const hasLines = request.lines.length > 0;
  const [result, setResult] = React.useState<{ key: string; quote: ClientCheckoutQuote } | null>(null);
  const [failure, setFailure] = React.useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  const fetchQuote = React.useEffectEvent(async () => {
    const sentKey = key;
    const response = await getCheckoutQuote(request);
    if (response.ok) {
      setResult({ key: sentKey, quote: response.quote });
      setFailure(null);
    } else {
      setFailure({ key: sentKey, message: response.message });
    }
  });

  React.useEffect(() => {
    if (!hasLines) return;
    const timer = window.setTimeout(() => void fetchQuote(), 250);
    return () => window.clearTimeout(timer);
  }, [key, hasLines, attempt]);

  const error = failure?.key === key ? failure.message : null;
  return {
    quote: result?.quote ?? null,
    pending: hasLines && result?.key !== key && error === null,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}

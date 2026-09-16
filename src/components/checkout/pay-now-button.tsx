"use client";

import * as React from "react";

import { resumePaymentAction } from "@/app/checkout/actions";
import { Button } from "@/components/ui/button";

/**
 * Opens a fresh Paystack checkout for an order still holding its pieces. Full
 * width on phones, where the label may wrap rather than push past the screen
 * edge. aria-disabled while opening, so focus stays on the button if it comes
 * back with an error.
 */
export function PayNowButton({ orderNumber, accessKey, label }: { orderNumber: string; accessKey: string; label: string }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div>
      <Button
        size="lg"
        arrow
        fullWidth
        className="h-auto min-h-14 whitespace-normal px-6 py-4 text-center sm:w-auto sm:px-9"
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        onClick={() => {
          if (pending) return;
          setError(null);
          startTransition(async () => {
            try {
              const result = await resumePaymentAction({ orderNumber, key: accessKey });
              if (result.ok) window.location.assign(result.redirectTo);
              else setError(result.message);
            } catch {
              setError("We couldn’t reach the payment page. Check your connection and try again.");
            }
          });
        }}
      >
        {pending ? "Opening Paystack…" : label}
      </Button>
      {error ? (
        <p role="alert" className="mt-3 text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

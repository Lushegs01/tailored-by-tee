"use client";

import * as React from "react";

import { resumeAccountPayment } from "@/app/account/(member)/orders/actions";
import { Button } from "@/components/ui/button";

/** Opens a fresh Paystack checkout for one of the signed-in customer's orders that still holds its pieces. */
export function PayOrderButton({ orderNumber, label }: { orderNumber: string; label: string }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div>
      <Button
        size="lg"
        arrow
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const result = await resumeAccountPayment(orderNumber);
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

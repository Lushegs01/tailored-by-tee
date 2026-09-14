"use client";

import * as React from "react";

import { resumePaymentAction } from "@/app/checkout/actions";
import { Button } from "@/components/ui/button";

/** Opens a fresh Paystack checkout for an order still holding its pieces. */
export function PayNowButton({ orderNumber, accessKey, label }: { orderNumber: string; accessKey: string; label: string }) {
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
            const result = await resumePaymentAction({ orderNumber, key: accessKey });
            if (result.ok) window.location.assign(result.redirectTo);
            else setError(result.message);
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

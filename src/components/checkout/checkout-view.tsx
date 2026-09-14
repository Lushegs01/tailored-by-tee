"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { placeOrderAction } from "@/app/checkout/actions";
import { useCart } from "@/components/cart/cart-provider";
import { EmptyState } from "@/components/feedback/empty-state";
import { useHasMounted } from "@/components/hooks/use-has-mounted";
import { ChevronDownIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { Skeleton } from "@/components/ui/skeleton";
import { TextLink } from "@/components/ui/text-link";
import { NIGERIAN_STATES } from "@/config/nigeria";
import type { CartLineInput } from "@/lib/catalog/types";
import { checkoutDetailsSchema, checkoutFieldErrors, type CheckoutField } from "@/lib/commerce/checkout-schema";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  clearCheckoutDraft,
  getCheckoutSessionId,
  loadCheckoutDraft,
  saveCheckoutDraft,
  toCheckoutDetails,
  type CheckoutFormState,
} from "./checkout-draft";
import { SelectField, TextareaField, TextField } from "./checkout-field";
import { CheckoutSummary } from "./checkout-summary";
import { useCheckoutQuote } from "./use-checkout-quote";

export interface CheckoutViewProps {
  mode: "orders-only" | "unavailable";
  reservationMinutes: number;
  pickup: { name: string; estimate: string; address: string } | null;
  /** Lowest delivery fee, for "From ₦3,500" before a state is chosen. */
  deliveryFromFee: number;
  supportEmail: string;
}

type FieldErrors = Partial<Record<CheckoutField, string>>;

const FIELD_ORDER: CheckoutField[] = ["fullName", "email", "phone", "line1", "line2", "city", "state", "postalCode", "deliveryNotes"];
const STATE_OPTIONS = NIGERIAN_STATES.map((state) => ({ value: state.code, label: state.name }));

/**
 * Checkout. Everything shown is the server's answer: the bag is re-priced with
 * live stock, the code re-checked and delivery quoted by state on every change,
 * and the order is created from a fresh quote on the server when placed.
 */
export function CheckoutView(props: CheckoutViewProps) {
  const cart = useCart();
  const router = useRouter();
  const mounted = useHasMounted();
  const [redirecting, setRedirecting] = React.useState(false);

  if (props.mode === "unavailable") {
    return (
      <EmptyState
        align="start"
        title="Checkout is *nearly ready.*"
        body={
          <>
            We&rsquo;re finishing online payments. Your bag is saved on this device — please check back soon, or email{" "}
            <a href={`mailto:${props.supportEmail}`} className="link-underline-static text-foreground">
              {props.supportEmail}
            </a>{" "}
            to order directly.
          </>
        }
        actions={<TextLink href="/cart">Back to your bag</TextLink>}
      />
    );
  }

  if (!mounted || redirecting) return <CheckoutSkeleton label={redirecting ? "Opening your order" : "Loading checkout"} />;

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        align="start"
        title="Your bag is *empty.*"
        body="Add a piece or two, then come back to check out."
        actions={
          <>
            <Button asChild arrow>
              <Link href="/shop/new-arrivals">Shop new arrivals</Link>
            </Button>
            <TextLink href="/collections">Explore collections</TextLink>
          </>
        }
      />
    );
  }

  return (
    <CheckoutForm
      {...props}
      lines={cart.lines}
      onPlaced={(url) => {
        setRedirecting(true);
        cart.clear();
        router.replace(url);
      }}
      onBagChanged={() => cart.refresh?.()}
    />
  );
}

function CheckoutForm({
  lines,
  mode,
  reservationMinutes,
  pickup,
  deliveryFromFee,
  onPlaced,
  onBagChanged,
}: CheckoutViewProps & {
  lines: CartLineInput[];
  onPlaced: (url: string) => void;
  onBagChanged: () => void;
}) {
  // Rendered only after mount, so reading the tab's draft here can't cause a hydration mismatch.
  const [form, setForm] = React.useState<CheckoutFormState>(loadCheckoutDraft);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<{ message: string; code: string } | null>(null);
  const [submitting, startSubmitting] = React.useTransition();
  const errorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => saveCheckoutDraft(form), [form]);

  const delivery = form.deliveryMethod === "delivery";
  const { quote, pending, error: quoteError, retry } = useCheckoutQuote({
    lines,
    deliveryMethod: form.deliveryMethod,
    stateCode: delivery && form.state ? form.state : null,
    couponCode: form.couponCode,
    email: form.email.trim() || null,
  });

  function set<K extends keyof CheckoutFormState>(key: K, value: CheckoutFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as CheckoutField];
      return next;
    });
  }

  function showFormError(message: string, code: string) {
    setFormError({ message, code });
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = checkoutDetailsSchema.safeParse(toCheckoutDetails(form));
    if (!parsed.success) {
      const next = checkoutFieldErrors(parsed.error);
      setErrors(next);
      const first = FIELD_ORDER.find((field) => next[field]);
      if (first) document.getElementById(`checkout-${first}`)?.focus();
      return;
    }
    setErrors({});

    startSubmitting(async () => {
      const result = await placeOrderAction({
        lines,
        details: toCheckoutDetails(form),
        // Only a code the server accepted is sent; a rejected one would fail the order.
        couponCode: quote?.coupon ? form.couponCode : null,
        checkoutSession: getCheckoutSessionId(),
      });

      if (result.ok) {
        clearCheckoutDraft();
        onPlaced(result.redirectTo);
        return;
      }
      setErrors(result.fieldErrors ?? {});
      if (result.code === "bag_changed" || result.code === "stock_conflict") onBagChanged();
      if (result.code === "coupon_invalid") set("couponCode", null);
      showFormError(result.message, result.code);
    });
  }

  const summaryProps = {
    quote,
    pending,
    error: quoteError,
    onRetry: retry,
    lineCount: lines.length,
    requestedCode: form.couponCode,
    onApplyCode: (code: string) => set("couponCode", code),
    onRemoveCode: () => set("couponCode", null),
    deliveryMethod: form.deliveryMethod,
  };

  const deliveryDetail =
    delivery && quote?.delivery
      ? `${quote.delivery.fee === 0 ? "Free" : formatPrice(quote.delivery.fee)} · ${quote.delivery.estimate}`
      : `From ${formatPrice(deliveryFromFee)} · fee depends on your state`;
  const total = quote ? formatPrice(quote.totals.total) : null;
  const submitLabel = mode === "orders-only" ? "Place test order" : "Pay";

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label="Checkout"
      className="lg:grid lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16"
    >
      <div className="lg:col-span-7">
        {/* Phones and tablets: the summary folds away above the form. */}
        <details className="group/summary mb-10 border-y lg:hidden">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2 text-label">
              Order summary
              <ChevronDownIcon
                aria-hidden="true"
                className="text-base transition-transform duration-300 ease-editorial group-open/summary:rotate-180"
              />
            </span>
            {quote ? <Price amount={quote.totals.total} className="text-body font-medium" /> : <Skeleton className="h-3 w-20" />}
          </summary>
          <div className="pb-6">
            <CheckoutSummary {...summaryProps} idPrefix="mobile" />
          </div>
        </details>

        {formError ? (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="mb-10 border border-danger/40 px-4 py-3 text-body-sm outline-none"
          >
            <p>{formError.message}</p>
            {formError.code === "bag_changed" || formError.code === "stock_conflict" ? (
              <Link href="/cart" className="mt-1 inline-flex min-h-11 items-center text-caption">
                <span className="link-underline-static pb-0.5">Review your bag</span>
              </Link>
            ) : null}
          </div>
        ) : null}

        <Section number={1} title="Contact" description="Your order confirmation and delivery updates go here.">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              id="checkout-fullName"
              label="Full name"
              autoComplete="name"
              value={form.fullName}
              onValueChange={(value) => set("fullName", value)}
              error={errors.fullName}
              className="sm:col-span-2"
            />
            <TextField
              id="checkout-email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              value={form.email}
              onValueChange={(value) => set("email", value)}
              error={errors.email}
            />
            <TextField
              id="checkout-phone"
              label="Mobile number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0803 123 4567"
              value={form.phone}
              onValueChange={(value) => set("phone", value)}
              error={errors.phone}
            />
          </div>
          <label className="mt-6 flex cursor-pointer items-start gap-3 text-body-sm">
            <input
              type="checkbox"
              checked={form.newsletter}
              onChange={(event) => set("newsletter", event.target.checked)}
              className="mt-0.5 size-4 shrink-0 cursor-pointer appearance-none border border-border-strong transition-colors checked:border-foreground checked:bg-foreground"
            />
            <span>
              Email me about new collections and studio news. <span className="text-muted-foreground">Optional — unsubscribe any time.</span>
            </span>
          </label>
        </Section>

        <Section number={2} title="Delivery">
          <fieldset>
            <legend className="sr-only">How would you like to receive your order?</legend>
            <div className={cn("grid gap-3", pickup && "sm:grid-cols-2")}>
              <MethodOption
                checked={delivery}
                onSelect={() => set("deliveryMethod", "delivery")}
                title="Deliver to an address"
                detail={deliveryDetail}
              />
              {pickup ? (
                <MethodOption
                  checked={!delivery}
                  onSelect={() => set("deliveryMethod", "pickup")}
                  title={pickup.name}
                  detail={`Free · ${pickup.estimate}`}
                />
              ) : null}
            </div>
          </fieldset>

          {delivery ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <TextField
                id="checkout-line1"
                label="Street address"
                autoComplete="address-line1"
                value={form.line1}
                onValueChange={(value) => set("line1", value)}
                error={errors.line1}
                className="sm:col-span-2"
              />
              <TextField
                id="checkout-line2"
                label="Apartment, estate or landmark"
                optional
                autoComplete="address-line2"
                value={form.line2}
                onValueChange={(value) => set("line2", value)}
                error={errors.line2}
                className="sm:col-span-2"
              />
              <TextField
                id="checkout-city"
                label="Town or city"
                autoComplete="address-level2"
                value={form.city}
                onValueChange={(value) => set("city", value)}
                error={errors.city}
              />
              <SelectField
                id="checkout-state"
                label="State"
                autoComplete="address-level1"
                placeholder="Choose a state"
                options={STATE_OPTIONS}
                value={form.state}
                onValueChange={(value) => set("state", value)}
                error={errors.state}
              />
              <TextField
                id="checkout-postalCode"
                label="Postal code"
                optional
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                value={form.postalCode}
                onValueChange={(value) => set("postalCode", value)}
                error={errors.postalCode}
              />
            </div>
          ) : pickup ? (
            <p className="mt-6 text-body-sm text-muted-foreground">
              Collect from {pickup.address}. We&rsquo;ll email you as soon as your order is ready — bring your order
              number.
            </p>
          ) : null}

          <TextareaField
            id="checkout-deliveryNotes"
            label={delivery ? "Delivery notes" : "Notes for the studio"}
            optional
            hint={delivery ? "A landmark, gate code or the best time to reach you." : undefined}
            value={form.deliveryNotes}
            onValueChange={(value) => set("deliveryNotes", value)}
            error={errors.deliveryNotes}
            maxLength={500}
            rows={3}
            className="mt-6"
          />
        </Section>

        <Section number={3} title="Payment">
          {mode === "orders-only" ? (
            <div className="mb-6 border border-accent-brand/40 bg-surface px-4 py-3 text-body-sm">
              <p className="text-eyebrow text-accent-brand">Test mode</p>
              <p className="mt-1">
                Online payment isn&rsquo;t connected yet. Placing an order now holds these pieces for {reservationMinutes}{" "}
                minutes as a test — nothing is charged.
              </p>
            </div>
          ) : null}
          <p className="text-body-sm text-muted-foreground">
            You&rsquo;ll pay securely with Paystack — card, bank transfer or USSD. We never see or store your card
            details.
          </p>

          <Button type="submit" size="lg" fullWidth disabled={submitting} aria-busy={submitting || undefined} className="mt-8">
            {submitting ? "Placing your order…" : total ? `${submitLabel} · ${total}` : submitLabel}
          </Button>
          <p className="mt-4 text-caption text-muted-foreground">
            By placing your order you agree to our{" "}
            <Link href="/terms" className="link-underline-static text-foreground">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="link-underline-static text-foreground">
              privacy policy
            </Link>
            .
          </p>
        </Section>
      </div>

      <aside aria-label="Order summary" className="hidden lg:col-span-5 lg:block">
        <div className="sticky top-[calc(var(--header-height)+2rem)] border-t pt-6">
          <h2 className="text-label">Order summary</h2>
          <div className="mt-2">
            <CheckoutSummary {...summaryProps} idPrefix="desktop" />
          </div>
        </div>
      </aside>
    </form>
  );
}

function Section({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const id = `checkout-section-${number}`;
  return (
    <section aria-labelledby={id} className="border-t py-10 first-of-type:border-t-0 first-of-type:pt-0 md:py-12">
      <div className="flex items-baseline gap-4">
        <span aria-hidden="true" className="w-6 text-micro tabular-nums text-muted-foreground">
          {String(number).padStart(2, "0")}
        </span>
        <h2 id={id} className="font-display text-display-xs">
          {title}
        </h2>
      </div>
      {description ? <p className="mt-2 pl-10 text-body-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function MethodOption({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 border px-4 py-4 transition-colors duration-300 ease-editorial",
        "has-[:focus-visible]:outline-[1.5px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid",
        checked ? "border-foreground" : "border-border-strong hover:border-foreground",
      )}
    >
      <input
        type="radio"
        name="checkout-delivery-method"
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 size-4 shrink-0 appearance-none rounded-full border border-border-strong transition-[border-width,border-color] duration-200 checked:border-[5px] checked:border-foreground focus-visible:outline-none"
      />
      <span>
        <span className="block text-body-sm font-medium">{title}</span>
        <span className="mt-1 block text-caption text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}

function CheckoutSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="lg:grid lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-5 lg:col-span-7">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
        <Skeleton className="mt-10 h-6 w-32" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div aria-hidden="true" className="hidden space-y-4 lg:col-span-5 lg:block">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

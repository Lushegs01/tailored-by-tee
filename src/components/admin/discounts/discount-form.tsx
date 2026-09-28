"use client";

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { createDiscount, updateDiscount } from "@/app/admin/discounts/actions";
import {
  AdminForm,
  AdminSection,
  CheckboxField,
  FieldShell,
  FormStatus,
  MoneyField,
  NumberField,
  SubmitButton,
  TextField,
  useFieldIds,
} from "@/components/admin/ui";
import { adminControlClassName } from "@/components/admin/ui/field-styles";
import { Input } from "@/components/ui/input";
import {
  CODE_MAX_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  normalizeDiscountCode,
  parseLagosDateTime,
  previewDiscount,
  type DiscountDraft,
  type DiscountType,
} from "@/lib/admin/discount-schema";
import type { RestrictionOption } from "@/lib/admin/discounts";
import { formatKobo, formatNumber, koboToNairaInput, parseNairaToKobo } from "@/lib/admin/format";
import { cn } from "@/lib/utils";

import { DiscountPreviewPanel } from "./discount-preview";
import { RestrictionPicker } from "./restriction-picker";

/*
 * The create/edit form for a discount code, with a plain-language summary beside
 * it that updates as the owner types (the same sentences the list and detail
 * page use, from lib/admin/discount-schema). The server re-checks everything.
 *
 * Editing leaves the code's on/off switch to the page's own button, so saving
 * the form never undoes a switch made meanwhile.
 */

export interface DiscountFormValues {
  id?: string;
  code: string;
  description: string;
  type: DiscountType;
  /** Whole percent for percentage codes; null otherwise. */
  percentOff: number | null;
  /** Kobo for fixed codes; null otherwise. */
  amountOff: number | null;
  minSubtotal: number | null;
  maxDiscount: number | null;
  /** datetime-local values in Lagos time ("" for none), prepared on the server. */
  startsAt: string;
  endsAt: string;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  categoryIds: string[];
  productIds: string[];
  isActive: boolean;
}

export interface DiscountFormProps {
  mode: "create" | "edit";
  initial: DiscountFormValues;
  categories: readonly RestrictionOption[];
  products: readonly RestrictionOption[];
  /** Edit: orders placed with the code so far (cancelled checkouts included). */
  ordersSoFar?: number;
  /** The server's clock when the page rendered, so the first render matches on both sides. */
  nowIso: string;
}

const TYPE_CHOICES: { value: DiscountType; label: string; hint: string }[] = [
  { value: "PERCENTAGE", label: "Percentage off", hint: "e.g. 10% off, with an optional cap" },
  { value: "FIXED", label: "Fixed amount off", hint: "e.g. ₦5,000 off" },
];

function textOf(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

/** The terms that decide what an order gets off, for "orders already placed keep theirs". */
function termsKey(draft: DiscountDraft, categoryIds: readonly string[], productIds: readonly string[]): string {
  const money = (text: string) => String(parseNairaToKobo(text) ?? text.trim());
  return JSON.stringify([
    draft.type,
    draft.type === "PERCENTAGE" ? draft.percentOff.trim().replace(/\s*%$/, "") : money(draft.amountOff),
    money(draft.minSubtotal),
    draft.type === "PERCENTAGE" ? money(draft.maxDiscount) : "",
    [...categoryIds].sort(),
    [...productIds].sort(),
  ]);
}

export function DiscountForm({ mode, initial, categories, products, ordersSoFar = 0, nowIso }: DiscountFormProps) {
  const [type, setType] = useState<DiscountType>(initial.type);
  const [categoryIds, setCategoryIds] = useState<string[]>(initial.categoryIds);
  const [productIds, setProductIds] = useState<string[]>(initial.productIds);

  const initialDraft = useMemo<DiscountDraft>(
    () => ({
      code: initial.code,
      type: initial.type,
      percentOff: initial.percentOff === null ? "" : String(initial.percentOff),
      amountOff: koboToNairaInput(initial.amountOff),
      minSubtotal: koboToNairaInput(initial.minSubtotal),
      maxDiscount: koboToNairaInput(initial.maxDiscount),
      startsAt: initial.startsAt,
      endsAt: initial.endsAt,
      usageLimit: initial.usageLimit === null ? "" : String(initial.usageLimit),
      perCustomerLimit: initial.perCustomerLimit === null ? "" : String(initial.perCustomerLimit),
      categoryNames: [],
      productNames: [],
    }),
    [initial],
  );
  const [typed, setTyped] = useState<DiscountDraft>(initialDraft);

  // Refresh the summary from the form's current values.
  function readForm(form: HTMLFormElement | null | undefined) {
    if (!form) return;
    const data = new FormData(form);
    setTyped({
      code: textOf(data, "code"),
      type: textOf(data, "type"),
      percentOff: textOf(data, "percentOff"),
      amountOff: textOf(data, "amountOff"),
      minSubtotal: textOf(data, "minSubtotal"),
      maxDiscount: textOf(data, "maxDiscount"),
      startsAt: textOf(data, "startsAt"),
      endsAt: textOf(data, "endsAt"),
      usageLimit: textOf(data, "usageLimit"),
      perCustomerLimit: textOf(data, "perCustomerLimit"),
      categoryNames: [],
      productNames: [],
    });
  }

  const categoryNames = useMemo(() => namesFor(categoryIds, categories), [categoryIds, categories]);
  const productNames = useMemo(() => namesFor(productIds, products), [productIds, products]);
  const [now] = useState(() => new Date(nowIso));
  const draft: DiscountDraft = { ...typed, type, categoryNames, productNames };
  const preview = previewDiscount(draft, now);

  const used = mode === "edit" && ordersSoFar > 0;
  const termsChanged =
    used &&
    termsKey(draft, categoryIds, productIds) !==
      termsKey({ ...initialDraft, type: initial.type }, initial.categoryIds, initial.productIds);
  const codeChanged = mode === "edit" && normalizeDiscountCode(typed.code) !== initial.code;

  const formProps = {
    onChange: (event: FormEvent<HTMLFormElement>) => readForm(event.currentTarget),
    noValidate: true,
    className: "grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,21rem)] lg:items-start",
  };

  const fields = (
    <>
      <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
        {mode === "edit" && initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}

        {used ? (
          <p role="note" className="border border-accent-brand/60 bg-accent-brand/5 px-4 py-3 text-body-sm">
            This code has been used on {formatNumber(ordersSoFar)} order{ordersSoFar === 1 ? "" : "s"}. You can change
            anything below; changes apply to orders from now on, and orders already placed keep the discount they got.
          </p>
        ) : null}

        <AdminSection title="Code">
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              name="code"
              label="Code"
              defaultValue={initial.code}
              required
              maxLength={CODE_MAX_LENGTH + 8}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="[&_input]:uppercase [&_input]:tracking-wide"
              onBlur={(event) => {
                const normalised = normalizeDiscountCode(event.currentTarget.value);
                if (normalised !== event.currentTarget.value) {
                  event.currentTarget.value = normalised;
                  readForm(event.currentTarget.form);
                }
              }}
              hint={
                codeChanged && used
                  ? `Customers type this at checkout. Changing it stops ${initial.code} working; orders already placed keep their code.`
                  : "What customers type at checkout: 3–32 letters, numbers or hyphens. Spaces are removed and letters made capitals, as at checkout."
              }
            />
            <TextField
              name="description"
              label="Description"
              optional
              defaultValue={initial.description}
              maxLength={MAX_DESCRIPTION_LENGTH}
              hint="For your records, e.g. “Instagram giveaway, October”. Customers don’t see it at checkout, though it’s sent to their browser with the code — so keep it free of anything private."
            />
          </div>
        </AdminSection>

        <AdminSection title="Discount">
          <fieldset className="min-w-0">
            <legend className="mb-2 text-body-sm font-medium">Type of discount</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {TYPE_CHOICES.map((choice) => (
                <label
                  key={choice.value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-3 border px-3 py-2.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[1.5px] has-[:focus-visible]:outline-ring",
                    type === choice.value ? "border-foreground" : "hover:border-border-strong",
                  )}
                >
                  <input
                    type="radio"
                    name="type"
                    value={choice.value}
                    checked={type === choice.value}
                    onChange={() => setType(choice.value)}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-foreground"
                  />
                  <span className="min-w-0">
                    <span className="block text-body-sm font-medium">{choice.label}</span>
                    <span className="block text-caption text-muted-foreground">{choice.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/*
            A fixed code can only carry a maximum discount if it was set up outside this form
            (checkout applies one to either kind). The field is percentage-only here, so saving
            clears it — say so rather than let it vanish quietly.
          */}
          {type === "FIXED" && initial.maxDiscount !== null ? (
            <p role="note" className="mt-4 border border-accent-brand/60 bg-accent-brand/5 px-4 py-3 text-body-sm">
              This code has a maximum discount of {formatKobo(initial.maxDiscount)} set from somewhere else. A fixed
              amount off doesn’t need one here — it can never take off more than the items cost — so saving will
              remove it. To keep a cap, use a percentage instead.
            </p>
          ) : null}

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {/* Both amounts stay in the form (hidden when not in use) so switching type keeps what was typed; the server reads only the chosen one. */}
            <div hidden={type !== "PERCENTAGE"}>
              <NumberField
                name="percentOff"
                label="Percentage off"
                suffix="%"
                defaultValue={initialDraft.percentOff}
                maxLength={4}
                hint="A whole number from 1 to 100."
              />
            </div>
            <div hidden={type !== "FIXED"}>
              <MoneyField
                name="amountOff"
                label="Amount off"
                defaultKobo={initial.amountOff}
                hint="Whole naira. If the items it covers cost less, the discount is what they cost."
              />
            </div>
            <div hidden={type !== "PERCENTAGE"}>
              <MoneyField
                name="maxDiscount"
                label="Maximum discount"
                optional
                defaultKobo={initial.maxDiscount}
                hint="The most one order can save. Leave empty for no cap."
              />
            </div>
            <MoneyField
              name="minSubtotal"
              label="Minimum order"
              optional
              defaultKobo={initial.minSubtotal}
              hint="The bag’s total before delivery, counting everything in it. Leave empty for no minimum."
            />
          </div>
        </AdminSection>

        <AdminSection
          title="What it applies to"
          description="Leave both empty for everything in the bag. Otherwise an item qualifies if it’s in any chosen category or is one of the chosen products; other items pay full price."
        >
          <div className="grid gap-6 md:grid-cols-2">
            <RestrictionPicker
              name="categoryIds"
              legend="Categories"
              options={categories}
              value={categoryIds}
              onChange={setCategoryIds}
              noun={{ one: "category", other: "categories" }}
            />
            <RestrictionPicker
              name="productIds"
              legend="Products"
              hint="Draft and archived products are marked; customers can only buy live ones."
              options={products}
              value={productIds}
              onChange={setProductIds}
              noun={{ one: "product", other: "products" }}
            />
          </div>
        </AdminSection>

        <AdminSection title="Dates and limits" description="Times are Lagos time. Leave anything empty for no limit.">
          <div className="grid gap-5 md:grid-cols-2">
            <DateTimeField
              name="startsAt"
              label="Starts"
              defaultValue={initial.startsAt}
              onCleared={readForm}
              hint="Leave empty to start as soon as it’s saved and switched on."
            />
            <DateTimeField
              name="endsAt"
              label="Ends"
              defaultValue={initial.endsAt}
              onCleared={readForm}
              hint="The code stops working at this minute. Leave empty for no end."
            />
            <NumberField
              name="usageLimit"
              label="Total uses"
              optional
              defaultValue={initialDraft.usageLimit}
              suffix="orders"
              maxLength={9}
              hint="Across all customers. Checkouts awaiting payment count until the payment window closes."
            />
            <NumberField
              name="perCustomerLimit"
              label="Uses per customer"
              optional
              defaultValue={initialDraft.perCustomerLimit}
              suffix="orders"
              maxLength={5}
              hint="Checked by the email address at checkout, so it can’t stop someone using a second address."
            />
          </div>
        </AdminSection>

        {mode === "create" ? (
          <AdminSection title="Availability">
            <CheckboxField
              name="isActive"
              label="Switch on when saved"
              defaultChecked={initial.isActive}
              hint="Customers can use it as soon as it’s saved (and its start has come). Untick to save it switched off and switch it on later."
            />
          </AdminSection>
        ) : null}
      </div>

      <DiscountPreviewPanel
        preview={preview}
        mode={mode}
        className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
      />

      <div className="min-w-0 border-t pt-5 lg:col-start-1 lg:row-start-2">
        {termsChanged ? (
          <p className="mb-4 text-body-sm text-accent-brand">
            You’ve changed what this code takes off. The new terms apply to orders from now on; the{" "}
            {formatNumber(ordersSoFar)} order{ordersSoFar === 1 ? "" : "s"} already placed keep what they got.
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SubmitButton pendingLabel={mode === "create" ? "Creating…" : "Saving…"}>
            {mode === "create" ? "Create discount" : "Save changes"}
          </SubmitButton>
          <FormStatus />
        </div>
      </div>
    </>
  );

  // Two branches so each form is typed by its own action's result.
  return mode === "create" ? (
    <AdminForm action={createDiscount} {...formProps}>
      {fields}
    </AdminForm>
  ) : (
    <AdminForm action={updateDiscount} {...formProps}>
      {fields}
    </AdminForm>
  );
}

function namesFor(ids: readonly string[], options: readonly RestrictionOption[]): string[] {
  const names = new Map(options.map((option) => [option.id, option.name]));
  return ids.map((id) => names.get(id) ?? "an unknown item").sort((a, b) => a.localeCompare(b, "en-GB"));
}

/**
 * A date and time (Lagos) with a Clear button: not every browser's picker can be
 * emptied by hand. Shows the chosen moment in words under the field.
 */
function DateTimeField({
  name,
  label,
  hint,
  defaultValue,
  onCleared,
}: {
  name: string;
  label: string;
  hint: ReactNode;
  defaultValue: string;
  /** Called with the form after the field is emptied by its Clear button. */
  onCleared: (form: HTMLFormElement | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const ids = useFieldIds(name, undefined, hint);
  const valid = value === "" || parseLagosDateTime(value) !== null;

  return (
    <FieldShell {...ids} label={label} optional hint={hint}>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          name={name}
          type="datetime-local"
          defaultValue={defaultValue}
          min="2000-01-01T00:00"
          max="2100-12-31T23:59"
          onChange={(event) => setValue(event.currentTarget.value)}
          className={cn(adminControlClassName, "min-w-0 flex-1 tabular-nums", !valid && "border-danger")}
          {...ids.controlProps}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = "";
              setValue("");
              onCleared(inputRef.current?.form ?? null);
              inputRef.current?.focus();
            }}
            className="inline-flex min-h-10 shrink-0 items-center px-1 text-caption text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="link-underline-static pb-0.5">
              Clear<span className="sr-only"> {label.toLowerCase()}</span>
            </span>
          </button>
        ) : null}
      </div>
    </FieldShell>
  );
}

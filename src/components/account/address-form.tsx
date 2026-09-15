import * as React from "react";

import { addAddress, editAddress } from "@/app/account/(member)/addresses/actions";
import { SelectField, TextField } from "@/components/checkout/checkout-field";
import { Button } from "@/components/ui/button";
import { NIGERIAN_STATES } from "@/config/nigeria";
import type { AddressField, AddressFieldErrors, SavedAddress } from "@/lib/account/addresses";
import { formatNigerianPhone } from "@/lib/commerce/phone";

/*
 * Add or edit one address, with the same fields, wording and rules as checkout
 * (the server validates with checkout's own schema). Rendered inside the address
 * book's sheet; the server's field messages sit under their fields.
 */

interface AddressFormValues {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  makeDefault: boolean;
}

export interface AddressFormProps {
  /** The address being edited, or null to add one. */
  address: SavedAddress | null;
  /** Prefills for a new address, from the profile. */
  defaults: { fullName: string; phone: string };
  /** Adding the first address: it becomes the default automatically. */
  isFirst: boolean;
  onSaved: (message: string, address: SavedAddress) => void;
  onCancel: () => void;
}

const FIELD_ORDER: AddressField[] = ["fullName", "phone", "line1", "line2", "city", "state", "postalCode", "label"];
const STATE_OPTIONS = NIGERIAN_STATES.map((state) => ({ value: state.code, label: state.name }));

export const ADDRESS_FIRST_FIELD_ID = "address-fullName";

function initialValues(address: SavedAddress | null, defaults: AddressFormProps["defaults"]): AddressFormValues {
  if (!address) {
    return {
      label: "",
      fullName: defaults.fullName,
      phone: defaults.phone,
      line1: "",
      line2: "",
      city: "",
      state: "",
      postalCode: "",
      makeDefault: false,
    };
  }
  return {
    label: address.label ?? "",
    fullName: address.fullName,
    phone: formatNigerianPhone(address.phone),
    line1: address.line1,
    line2: address.line2 ?? "",
    city: address.city,
    state: address.state,
    postalCode: address.postalCode ?? "",
    makeDefault: false,
  };
}

export function AddressForm({ address, defaults, isFirst, onSaved, onCancel }: AddressFormProps) {
  const [values, setValues] = React.useState<AddressFormValues>(() => initialValues(address, defaults));
  const [errors, setErrors] = React.useState<AddressFieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startSaving] = React.useTransition();
  const errorRef = React.useRef<HTMLDivElement>(null);

  function set<K extends keyof AddressFormValues>(key: K, value: AddressFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as AddressField];
      return next;
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);

    startSaving(async () => {
      const result = address ? await editAddress({ id: address.id, address: values }) : await addAddress(values);
      if (result.ok) {
        onSaved(result.message, result.address);
        return;
      }

      const fieldErrors = result.fieldErrors ?? {};
      setErrors(fieldErrors);
      setFormError(result.message);
      const first = FIELD_ORDER.find((field) => fieldErrors[field]);
      requestAnimationFrame(() => {
        (first ? document.getElementById(`address-${first}`) : errorRef.current)?.focus();
      });
    });
  }

  return (
    <form noValidate onSubmit={submit} aria-label={address ? "Edit address" : "Add an address"}>
      {formError ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mb-8 border border-danger/40 px-4 py-3 text-body-sm outline-none"
        >
          {formError}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="address-fullName"
          label="Full name"
          autoComplete="name"
          maxLength={100}
          value={values.fullName}
          onValueChange={(value) => set("fullName", value)}
          error={errors.fullName}
          className="sm:col-span-2"
        />
        <TextField
          id="address-phone"
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0803 123 4567"
          value={values.phone}
          onValueChange={(value) => set("phone", value)}
          error={errors.phone}
          className="sm:col-span-2"
        />
        <TextField
          id="address-line1"
          label="Street address"
          autoComplete="address-line1"
          maxLength={200}
          value={values.line1}
          onValueChange={(value) => set("line1", value)}
          error={errors.line1}
          className="sm:col-span-2"
        />
        <TextField
          id="address-line2"
          label="Apartment, estate or landmark"
          optional
          autoComplete="address-line2"
          maxLength={200}
          value={values.line2}
          onValueChange={(value) => set("line2", value)}
          error={errors.line2}
          className="sm:col-span-2"
        />
        <TextField
          id="address-city"
          label="Town or city"
          autoComplete="address-level2"
          maxLength={100}
          value={values.city}
          onValueChange={(value) => set("city", value)}
          error={errors.city}
        />
        <SelectField
          id="address-state"
          label="State"
          autoComplete="address-level1"
          placeholder="Choose a state"
          options={STATE_OPTIONS}
          value={values.state}
          onValueChange={(value) => set("state", value)}
          error={errors.state}
        />
        <TextField
          id="address-postalCode"
          label="Postal code"
          optional
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={values.postalCode}
          onValueChange={(value) => set("postalCode", value)}
          error={errors.postalCode}
        />
        <TextField
          id="address-label"
          label="Label"
          optional
          placeholder="Home, Office…"
          hint="A name to tell your addresses apart."
          autoComplete="off"
          maxLength={40}
          value={values.label}
          onValueChange={(value) => set("label", value)}
          error={errors.label}
          className="sm:col-span-2"
        />
      </div>

      <div className="mt-8 border-t pt-6">
        {address?.isDefault ? (
          <p className="text-body-sm text-muted-foreground">This is your default address.</p>
        ) : isFirst ? (
          <p className="text-body-sm text-muted-foreground">Your first address becomes your default.</p>
        ) : (
          <label className="flex cursor-pointer items-start gap-3 text-body-sm">
            <input
              type="checkbox"
              checked={values.makeDefault}
              onChange={(event) => set("makeDefault", event.target.checked)}
              className="mt-0.5 size-4 shrink-0 cursor-pointer appearance-none border border-border-strong transition-colors checked:border-foreground checked:bg-foreground"
            />
            <span>
              Make this my default address{" "}
              <span className="text-muted-foreground">— the one filled in for you at checkout.</span>
            </span>
          </label>
        )}
      </div>

      <div className="mt-10 grid gap-3">
        <Button type="submit" size="lg" fullWidth disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Saving…" : address ? "Save changes" : "Save address"}
        </Button>
        <Button type="button" variant="ghost" fullWidth onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

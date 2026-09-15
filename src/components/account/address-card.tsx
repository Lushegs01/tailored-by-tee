import * as React from "react";

import { findState } from "@/config/nigeria";
import type { SavedAddress } from "@/lib/account/addresses";
import { formatNigerianPhone } from "@/lib/commerce/phone";
import { cn } from "@/lib/utils";

/*
 * One saved address. Presentational — the address book owns the actions — and
 * rendered only inside it (a client tree), since it takes callbacks.
 */

export function addressCardId(id: string): string {
  return `address-${id}`;
}

/** Short name for announcements and screen-reader context: the label, else the street. */
export function addressName(address: SavedAddress): string {
  return address.label ?? address.line1;
}

export function stateName(code: string): string {
  return findState(code)?.name ?? code;
}

/** "Home, 12 Admiralty Way, Lekki, Lagos" — one line for confirmations. */
export function addressSummary(address: SavedAddress): string {
  return [address.label, address.line1, address.city, stateName(address.state)].filter(Boolean).join(", ");
}

export interface AddressCardProps {
  address: SavedAddress;
  /** Another change is in flight: actions are unavailable until it settles. */
  busy: boolean;
  /** This card is being made the default. */
  settingDefault: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMakeDefault: () => void;
}

export function AddressCard({ address, busy, settingDefault, onEdit, onDelete, onMakeDefault }: AddressCardProps) {
  const name = addressName(address);
  const cityLine = `${address.city}, ${stateName(address.state)}${address.postalCode ? ` ${address.postalCode}` : ""}`;

  return (
    <li
      id={addressCardId(address.id)}
      tabIndex={-1}
      data-default={address.isDefault || undefined}
      className={cn(
        "flex min-w-0 flex-col border p-5 sm:p-6",
        address.isDefault ? "border-foreground/60" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="min-w-0 text-label [overflow-wrap:anywhere]">{address.label ?? address.fullName}</h3>
        {address.isDefault ? (
          <span className="shrink-0 border border-foreground/60 px-2 py-0.5 text-eyebrow">Default</span>
        ) : null}
      </div>

      <address className="mt-4 text-body-sm not-italic [overflow-wrap:anywhere]">
        {address.label ? <span className="block font-medium">{address.fullName}</span> : null}
        <span className="block">{address.line1}</span>
        {address.line2 ? <span className="block">{address.line2}</span> : null}
        <span className="block">{cityLine}</span>
        <span className="mt-2 block text-muted-foreground">{formatNigerianPhone(address.phone)}</span>
      </address>

      <div className="mt-auto flex flex-wrap items-center gap-x-6 pt-5">
        <CardAction onClick={onEdit} disabled={busy}>
          Edit<span className="sr-only">: {name}</span>
        </CardAction>
        {address.isDefault ? null : (
          <CardAction onClick={onMakeDefault} disabled={busy} pending={settingDefault}>
            {settingDefault ? "Setting as default…" : "Set as default"}
            <span className="sr-only">: {name}</span>
          </CardAction>
        )}
        <CardAction onClick={onDelete} disabled={busy}>
          Delete<span className="sr-only">: {name}</span>
        </CardAction>
      </div>
    </li>
  );
}

/**
 * Quiet text action with a 44px touch target. Unavailable actions use
 * aria-disabled rather than disabled, so a focused control keeps its focus.
 */
function CardAction({
  onClick,
  disabled,
  pending,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  pending?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) onClick();
      }}
      aria-disabled={disabled || undefined}
      aria-busy={pending || undefined}
      className="inline-flex min-h-11 items-center text-label text-foreground transition-opacity duration-300 ease-editorial aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
    >
      <span className="link-underline-static pb-0.5">{children}</span>
    </button>
  );
}

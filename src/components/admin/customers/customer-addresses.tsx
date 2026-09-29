import { AdminEmptyState, StatusBadge } from "@/components/admin/ui";
import { findState } from "@/config/nigeria";
import { deliveryPolicy } from "@/config/policies";
import type { CustomerAddress, GuestDeliveryAddress } from "@/lib/admin/customers";
import { formatNigerianPhone } from "@/lib/commerce/phone";
import { cn } from "@/lib/utils";

/*
 * Addresses, read-only. A customer's saved addresses belong to them and are
 * changed in their own account; a guest has none, so their most recent delivery
 * address is shown instead, as a way of recognising a returning shopper.
 */

/** The state's full name where we know it ("Lagos"), otherwise the code as stored. */
function stateName(code: string | null): string | null {
  if (!code) return null;
  return findState(code)?.name ?? code;
}

function addressLines(address: {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}): string[] {
  const place = [address.city, stateName(address.state)].filter(Boolean).join(", ");
  return [address.line1, address.line2, place, address.postalCode].filter(
    (line): line is string => typeof line === "string" && line.trim() !== "",
  );
}

function AddressBody({
  fullName,
  phone,
  lines,
  className,
}: {
  fullName: string | null;
  phone: string | null;
  lines: string[];
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 text-body-sm", className)}>
      {fullName ? <p className="font-medium break-words">{fullName}</p> : null}
      <address className="mt-1 not-italic text-muted-foreground">
        {lines.length > 0 ? (
          lines.map((line, index) => (
            <span key={`${line}-${index}`} className="block break-words">
              {line}
            </span>
          ))
        ) : (
          <span className="block">No address recorded.</span>
        )}
        {phone ? <span className="mt-1 block tabular-nums">{formatNigerianPhone(phone)}</span> : null}
      </address>
    </div>
  );
}

/** The addresses a customer has saved to their account, in the order they see them. */
export function CustomerAddressList({ addresses }: { addresses: readonly CustomerAddress[] }) {
  if (addresses.length === 0) {
    return (
      <AdminEmptyState
        title="No saved addresses"
        body="They haven’t saved an address to their account. Each order still carries the address it was delivered to."
      />
    );
  }

  return (
    <ul className="grid gap-px bg-border sm:grid-cols-2">
      {addresses.map((address) => (
        <li key={address.id} className="bg-background-raised p-4">
          <div className="flex flex-wrap items-center gap-2">
            {address.label ? <p className="text-label">{address.label}</p> : null}
            {address.isDefault ? <StatusBadge tone="info">Default</StatusBadge> : null}
          </div>
          <AddressBody
            fullName={address.fullName}
            phone={address.phone}
            lines={addressLines(address)}
            className={address.label || address.isDefault ? "mt-2" : undefined}
          />
        </li>
      ))}
    </ul>
  );
}

/** Where a guest's most recent order went — collection, or the address they gave. */
export function GuestLastAddress({ address }: { address: GuestDeliveryAddress | null }) {
  if (!address) {
    return <AdminEmptyState title="No delivery address" body="Their most recent order has no address recorded." />;
  }

  if (address.isPickup) {
    const pickup = deliveryPolicy.pickup;
    return (
      <div className="text-body-sm">
        <p className="font-medium">Collected from the studio</p>
        {pickup ? <p className="mt-1 text-muted-foreground break-words">{pickup.address}</p> : null}
        <p className="mt-2 text-caption text-muted-foreground">
          Their most recent order was collected rather than delivered.
        </p>
      </div>
    );
  }

  return (
    <>
      <AddressBody fullName={address.fullName} phone={address.phone} lines={addressLines(address)} />
      <p className="mt-3 text-caption text-muted-foreground">
        The address on their most recent order. Every order keeps its own copy.
      </p>
    </>
  );
}

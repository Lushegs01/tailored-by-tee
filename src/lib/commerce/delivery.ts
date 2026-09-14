import { deliveryPolicy, type DeliveryPolicy, type DeliveryZone } from "@/config/policies";
import type { Kobo } from "@/lib/catalog/types";

/*
 * Delivery fees, from the policy in config/policies.ts. Pure: the policy is a
 * parameter (defaulting to the configured one), so every rule is testable.
 */

export type DeliveryMethod = "delivery" | "pickup";

export interface DeliveryQuote {
  method: DeliveryMethod;
  /** Integer kobo; 0 when free. */
  fee: Kobo;
  /** Zone name ("Lagos") or the pickup name. */
  label: string;
  estimate: string;
  /** Null for pickup. */
  zoneId: string | null;
  /** The subtotal that makes this delivery free, when the zone has one. */
  freeOver: Kobo | null;
  isFree: boolean;
  /** How much more would make delivery free; null when it already is, or never can be. */
  amountToFree: Kobo | null;
}

/** The zone that names this state, else the catch-all zone (states: null), else the last zone. */
export function zoneForState(policy: DeliveryPolicy, stateCode: string): DeliveryZone {
  const code = stateCode.trim().toUpperCase();
  return (
    policy.zones.find((zone) => zone.states?.includes(code)) ??
    policy.zones.find((zone) => zone.states === null) ??
    policy.zones[policy.zones.length - 1]
  );
}

/**
 * The fee for an order. `subtotal` is the merchandise total after any discount,
 * which is what a free-delivery threshold is measured against. Returns null when
 * it can't be quoted yet (delivery without a state) or pickup isn't offered.
 */
export function quoteDelivery(
  input: { method: DeliveryMethod; stateCode: string | null | undefined; subtotal: Kobo },
  policy: DeliveryPolicy = deliveryPolicy,
): DeliveryQuote | null {
  if (input.method === "pickup") {
    if (!policy.pickup?.enabled) return null;
    return {
      method: "pickup",
      fee: 0,
      label: policy.pickup.name,
      estimate: policy.pickup.estimate,
      zoneId: null,
      freeOver: null,
      isFree: true,
      amountToFree: null,
    };
  }

  if (!input.stateCode || policy.zones.length === 0) return null;
  const zone = zoneForState(policy, input.stateCode);
  const isFree = zone.freeOver !== null && input.subtotal >= zone.freeOver;

  return {
    method: "delivery",
    fee: isFree ? 0 : zone.fee,
    label: zone.name,
    estimate: zone.estimate,
    zoneId: zone.id,
    freeOver: zone.freeOver,
    isFree,
    amountToFree: zone.freeOver !== null && !isFree ? zone.freeOver - input.subtotal : null,
  };
}

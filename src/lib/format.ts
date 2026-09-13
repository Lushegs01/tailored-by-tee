import type { Kobo } from "@/lib/catalog/types";

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Formats integer kobo as whole naira, e.g. 4_800_000 → "₦48,000". */
export function formatPrice(amount: Kobo): string {
  return naira.format(amount / 100);
}

export function nairaToKobo(naira: number): Kobo {
  return Math.round(naira * 100);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

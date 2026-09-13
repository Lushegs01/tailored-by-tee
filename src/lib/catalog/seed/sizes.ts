import type { Size, SizeSystem } from "../types";

/**
 * Size registry, grouped by system. Registry order is display order, so a range
 * such as `sizesBetween("s", "xl")` always comes back smallest first.
 */
interface SizeSeed {
  label: string;
  system: SizeSystem;
  /** Code used in SKUs. */
  code: string;
}

const sizeSeeds = {
  xs: { label: "XS", system: "apparel", code: "XS" },
  s: { label: "S", system: "apparel", code: "S" },
  m: { label: "M", system: "apparel", code: "M" },
  l: { label: "L", system: "apparel", code: "L" },
  xl: { label: "XL", system: "apparel", code: "XL" },
  xxl: { label: "XXL", system: "apparel", code: "XXL" },
  w28: { label: "28", system: "waist", code: "28" },
  w30: { label: "30", system: "waist", code: "30" },
  w32: { label: "32", system: "waist", code: "32" },
  w34: { label: "34", system: "waist", code: "34" },
  w36: { label: "36", system: "waist", code: "36" },
  w38: { label: "38", system: "waist", code: "38" },
  b80: { label: "80", system: "belt", code: "80" },
  b85: { label: "85", system: "belt", code: "85" },
  b90: { label: "90", system: "belt", code: "90" },
  b95: { label: "95", system: "belt", code: "95" },
  b100: { label: "100", system: "belt", code: "100" },
  "one-size": { label: "One Size", system: "one-size", code: "OS" },
} as const satisfies Record<string, SizeSeed>;

export type SizeId = keyof typeof sizeSeeds;

const SIZE_ORDER = Object.keys(sizeSeeds) as SizeId[];

export const SIZES: readonly Size[] = SIZE_ORDER.map((id, index) => ({
  id,
  label: sizeSeeds[id].label,
  system: sizeSeeds[id].system,
  sortOrder: index + 1,
}));

export function sizeSkuCode(id: SizeId): string {
  return sizeSeeds[id].code;
}

/** Inclusive range within one size system, e.g. `sizesBetween("w28", "w36")`. */
export function sizesBetween(from: SizeId, to: SizeId): SizeId[] {
  if (sizeSeeds[from].system !== sizeSeeds[to].system) {
    throw new Error(`sizesBetween: "${from}" and "${to}" belong to different size systems`);
  }
  return SIZE_ORDER.slice(SIZE_ORDER.indexOf(from), SIZE_ORDER.indexOf(to) + 1);
}

import type { SizeSystem } from "@/lib/catalog/types";

/*
 * Size guides, as data. Product pages find their guide by category first, then
 * by size system, so a category can get its own chart without code changes.
 *
 * ⚠ PLACEHOLDER MEASUREMENTS. These are typical body measurements for demo
 * purposes. Replace them with the studio's own measurements before launch.
 */

/** Centimetres: a single value, or a [from, to] range. */
export type Measurement = number | readonly [number, number];

export interface SizeGuide {
  id: string;
  title: string;
  intro: string;
  /** Measurement columns after the size column. */
  columns: string[];
  rows: { size: string; values: Measurement[] }[];
  howToMeasure: { label: string; text: string }[];
}

const HOW_TO_CHEST = {
  label: "Chest",
  text: "Around the fullest part of your chest, under the arms, keeping the tape level.",
};
const HOW_TO_WAIST = { label: "Waist", text: "Around your natural waistline, just above the hip bones." };
const HOW_TO_HIP = { label: "Hip", text: "Around the fullest part of your seat, with your feet together." };

export const SIZE_GUIDES = {
  clothing: {
    id: "clothing",
    title: "Clothing",
    intro:
      "Body measurements in centimetres. Between sizes? Take the larger for an easier fit, the smaller for a closer one — each product's fit note says how it is cut.",
    columns: ["Chest", "Waist", "Hip"],
    rows: [
      { size: "XS", values: [86, 72, 88] },
      { size: "S", values: [91, 77, 93] },
      { size: "M", values: [96, 82, 98] },
      { size: "L", values: [102, 88, 104] },
      { size: "XL", values: [108, 94, 110] },
      { size: "XXL", values: [114, 100, 116] },
    ],
    howToMeasure: [HOW_TO_CHEST, HOW_TO_WAIST, HOW_TO_HIP],
  },
  trousers: {
    id: "trousers",
    title: "Trousers & denim",
    intro:
      "Waist sizes follow body measurements in inches; the chart below gives them in centimetres too. Rigid denim relaxes by about a size with wear.",
    columns: ["Waist", "Hip", "Inside leg"],
    rows: [
      { size: "28", values: [71, 90, 81] },
      { size: "30", values: [76, 95, 81] },
      { size: "32", values: [81, 100, 82] },
      { size: "34", values: [86, 105, 82] },
      { size: "36", values: [91, 110, 83] },
      { size: "38", values: [97, 115, 83] },
    ],
    howToMeasure: [
      HOW_TO_WAIST,
      HOW_TO_HIP,
      { label: "Inside leg", text: "From the crotch seam down the inside of the leg to the ankle bone." },
    ],
  },
  belts: {
    id: "belts",
    title: "Belts",
    intro: "Belt sizes are the length in centimetres from the buckle's pin to the middle hole.",
    columns: ["Fits waist", "Total length"],
    rows: [
      { size: "80", values: [[70, 76], 98] },
      { size: "85", values: [[75, 81], 103] },
      { size: "90", values: [[80, 86], 108] },
      { size: "95", values: [[85, 91], 113] },
      { size: "100", values: [[90, 96], 118] },
    ],
    howToMeasure: [
      {
        label: "From a belt you own",
        text: "Measure from the pin of the buckle to the hole you use most. That's your size.",
      },
      {
        label: "Without a belt",
        text: "Measure around your trousers where the belt sits, then add about 5cm.",
      },
    ],
  },
} satisfies Record<string, SizeGuide>;

export type SizeGuideId = keyof typeof SIZE_GUIDES;

/** The default guide for each size system. One-size pieces have none. */
export const SIZE_GUIDE_BY_SYSTEM: Partial<Record<SizeSystem, SizeGuideId>> = {
  apparel: "clothing",
  waist: "trousers",
  belt: "belts",
};

/** Category-specific charts win over the size-system default. Empty until a category needs its own. */
export const SIZE_GUIDE_BY_CATEGORY: Partial<Record<string, SizeGuideId>> = {};

export function findSizeGuide(categorySlug: string, system: SizeSystem): SizeGuide | null {
  const id = SIZE_GUIDE_BY_CATEGORY[categorySlug] ?? SIZE_GUIDE_BY_SYSTEM[system];
  return id ? SIZE_GUIDES[id] : null;
}

/** "96", "70–76" in centimetres; inches rounded to the nearest half. */
export function formatMeasurement(value: Measurement, unit: "cm" | "in"): string {
  const convert = (cm: number) => (unit === "cm" ? String(cm) : String(Math.round((cm / 2.54) * 2) / 2));
  return typeof value === "number" ? convert(value) : `${convert(value[0])}–${convert(value[1])}`;
}

import type { Color } from "../types";

/**
 * Colour registry. Colours are shared across products (one "Stone" everywhere),
 * which keeps filters honest and mirrors the planned `Color` table.
 */
interface ColorSeed {
  name: string;
  hex: string;
  /** Three-letter code used in SKUs. */
  code: string;
}

const colorSeeds = {
  ink: { name: "Ink", hex: "#1C1C1E", code: "INK" },
  chalk: { name: "Chalk", hex: "#F1EEE6", code: "CHK" },
  bone: { name: "Bone", hex: "#E6DFD1", code: "BON" },
  ecru: { name: "Ecru", hex: "#E9E2D0", code: "ECR" },
  oatmeal: { name: "Oatmeal", hex: "#D6CBB6", code: "OAT" },
  sand: { name: "Sand", hex: "#C9B592", code: "SND" },
  stone: { name: "Stone", hex: "#ADA597", code: "STN" },
  taupe: { name: "Taupe", hex: "#857868", code: "TAU" },
  camel: { name: "Camel", hex: "#B38A5E", code: "CML" },
  clay: { name: "Clay", hex: "#A5634A", code: "CLY" },
  tobacco: { name: "Tobacco", hex: "#6F4B2E", code: "TOB" },
  chocolate: { name: "Chocolate", hex: "#45302A", code: "CHC" },
  olive: { name: "Olive", hex: "#5B5A3C", code: "OLV" },
  sage: { name: "Sage", hex: "#9CA38E", code: "SGE" },
  "pale-blue": { name: "Pale Blue", hex: "#BFCCD8", code: "PBL" },
  navy: { name: "Navy", hex: "#232A38", code: "NVY" },
  "indigo-rinse": { name: "Indigo Rinse", hex: "#2E3A52", code: "IND" },
  charcoal: { name: "Charcoal", hex: "#3B3B3D", code: "CHR" },
  slate: { name: "Slate", hex: "#6E6E6C", code: "SLT" },
  "mid-wash": { name: "Mid Wash", hex: "#5B7190", code: "MDW" },
  "washed-black": { name: "Washed Black", hex: "#2C2B2A", code: "WBK" },
} as const satisfies Record<string, ColorSeed>;

export type ColorId = keyof typeof colorSeeds;

/** Every colour, in registry order. The id is the slug. */
export const COLORS: readonly Color[] = Object.entries(colorSeeds).map(([slug, seed]) => ({
  id: slug,
  slug,
  name: seed.name,
  hex: seed.hex,
}));

export function colorSkuCode(id: ColorId): string {
  return colorSeeds[id].code;
}

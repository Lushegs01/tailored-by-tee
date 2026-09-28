/*
 * Variant SKUs: "TBT-<category>-<product>-<colour>-<size>", e.g. "TBT-KNT-KPL-SND-M".
 *
 * This is exactly the format the seed catalogue uses (buildSku in
 * lib/catalog/mappers.ts), so a variant made in the admin area sits alongside
 * the seeded ones: the product page's structured data reads the first three
 * parts as the product's code, and packing lists, labels and order lines all
 * show the same string. Each part is capital letters and digits only — a hyphen
 * inside a part would split it.
 *
 * Pure (no server or browser APIs): the variants service, the forms' previews
 * and the tests all use it.
 */

export const SKU_PREFIX = "TBT";

const SEPARATOR = "-";

/** One part of a SKU: capital letters and digits, no spaces or hyphens. */
const SKU_PART = /^[A-Z0-9]{1,10}$/;

export interface VariantSkuParts {
  /** The category's three-letter code, e.g. "KNT". */
  categoryCode: string;
  /** The product's three-letter code, e.g. "KPL". */
  productCode: string;
  /** The colour's three-letter code, e.g. "SND". */
  colorCode: string;
  /** The size's code, e.g. "M", "32", "OS". */
  sizeCode: string;
}

export type SkuPartKind = "category" | "product" | "colour" | "size";

const PART_NAMES: Record<SkuPartKind, string> = {
  category: "category code",
  product: "product code",
  colour: "colour code",
  size: "size code",
};

/** A code as it's stored and used in SKUs: trimmed, capital letters. */
export function normaliseSkuCode(value: string): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/** Why a code can't be part of a SKU, in a sentence for the owner; null when it can. */
export function skuPartProblem(kind: SkuPartKind, code: string): string | null {
  const value = normaliseSkuCode(code);
  if (value === "") return `The ${PART_NAMES[kind]} is missing.`;
  if (!SKU_PART.test(value)) {
    return `The ${PART_NAMES[kind]} “${code.trim()}” can’t be used in SKUs. Codes use capital letters and numbers only, with no spaces or hyphens.`;
  }
  return null;
}

/**
 * The SKU for a new variant, from its category's, product's, colour's and size's
 * codes. Throws RangeError for a part that isn't capital letters and digits (check
 * with skuPartProblem first to explain it to the owner): a malformed SKU is never
 * produced.
 */
export function buildVariantSku(parts: VariantSkuParts): string {
  const entries: [SkuPartKind, string][] = [
    ["category", parts.categoryCode],
    ["product", parts.productCode],
    ["colour", parts.colorCode],
    ["size", parts.sizeCode],
  ];
  const values = entries.map(([kind, code]) => {
    const value = normaliseSkuCode(code);
    if (!SKU_PART.test(value)) {
      throw new RangeError(`buildVariantSku: invalid ${PART_NAMES[kind]} ${JSON.stringify(code)}`);
    }
    return value;
  });
  return [SKU_PREFIX, ...values].join(SEPARATOR);
}

/** The parts of a SKU in the standard format, or null for anything else. */
export function parseVariantSku(sku: string): VariantSkuParts | null {
  if (typeof sku !== "string") return null;
  const parts = sku.trim().split(SEPARATOR);
  if (parts.length !== 5 || parts[0] !== SKU_PREFIX) return null;
  const [, categoryCode, productCode, colorCode, sizeCode] = parts;
  if (![categoryCode, productCode, colorCode, sizeCode].every((part) => SKU_PART.test(part))) return null;
  return { categoryCode, productCode, colorCode, sizeCode };
}

/* ── Colour and size codes ─────────────────────────────────────────────── */

/** A colour's code: exactly three capital letters, like every seeded colour ("SND", "PBL"). */
export const COLOR_CODE_PATTERN = /^[A-Z]{3}$/;

/** A size's code: one to five capital letters or digits ("M", "XXL", "32", "100", "OS"). */
export const SIZE_CODE_PATTERN = /^[A-Z0-9]{1,5}$/;

export const COLOR_CODE_LENGTH = 3;
export const SIZE_CODE_MAX = 5;

/** Why a colour code can't be used; null when it can. */
export function colorCodeProblem(code: string): string | null {
  const value = normaliseSkuCode(code);
  if (value === "") return "Enter a three-letter code for SKUs, e.g. SND for Sand.";
  if (!COLOR_CODE_PATTERN.test(value)) return "Use exactly three letters, e.g. SND for Sand.";
  return null;
}

/** Why a size code can't be used; null when it can. */
export function sizeCodeProblem(code: string): string | null {
  const value = normaliseSkuCode(code);
  if (value === "") return "Enter a short code for SKUs, e.g. M, XXL or 32.";
  if (!SIZE_CODE_PATTERN.test(value)) {
    return `Use up to ${SIZE_CODE_MAX} capital letters or numbers, with no spaces, e.g. M, XXL or 32.`;
  }
  return null;
}

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

/** The name's words in plain capital letters: "Pale Blue" → ["PALE", "BLUE"], "Écru" → ["ECRU"]. */
function letterWords(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
}

/** Every three-letter pick from `letters`, in order, starting with its first letter. */
function* orderedPicks(letters: string): Generator<string> {
  const first = letters[0];
  for (let second = 1; second < letters.length; second++) {
    for (let third = second + 1; third < letters.length; third++) {
      yield `${first}${letters[second]}${letters[third]}`;
    }
  }
}

/**
 * A free three-letter code for a new colour, in the style of the seeded ones:
 * the first letter and the next consonants ("Sand" → SND, "Pale Blue" → PBL),
 * else the first three letters, else other letters from the name in order, else
 * the first letter and any two letters. Null when the name has no letters.
 * Only a suggestion: the owner can type another.
 */
export function suggestColorCode(name: string, taken: Iterable<string>): string | null {
  const used = new Set<string>();
  for (const code of taken) used.add(normaliseSkuCode(code));

  const words = letterWords(name);
  if (words.length === 0) return null;
  const letters = words.join("");
  const first = letters[0];

  /** The first letter, then consonants from `rest`; short of those ("Sage" → S, G), the letters after the last one (E). */
  const skeleton = (rest: string): string => {
    const picked = [first];
    let last = -1;
    for (let index = 0; index < rest.length && picked.length < 3; index++) {
      if (VOWELS.has(rest[index])) continue;
      picked.push(rest[index]);
      last = index;
    }
    for (let index = last + 1; index < rest.length && picked.length < 3; index++) picked.push(rest[index]);
    return picked.join("");
  };

  const candidates: string[] = [];

  if (words.length >= 2) candidates.push(skeleton(words.slice(1).join("")));
  candidates.push(skeleton(letters.slice(1)));
  candidates.push(letters.slice(0, 3));
  for (const pick of orderedPicks(letters)) candidates.push(pick);

  for (const candidate of candidates) {
    if (COLOR_CODE_PATTERN.test(candidate) && !used.has(candidate)) return candidate;
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const second of alphabet) {
    for (const third of alphabet) {
      const candidate = `${first}${second}${third}`;
      if (!used.has(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * A code for a new size: the label itself when it's short ("XXXL", "40", "3XL"),
 * or the initials of a longer one ("One Size" → OS). Null when that code is
 * already taken or can't be made from the label; the owner then types one.
 */
export function suggestSizeCode(label: string, taken: Iterable<string>): string | null {
  const used = new Set<string>();
  for (const code of taken) used.add(normaliseSkuCode(code));

  const words = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return null;

  const candidate = words.length === 1 ? words[0] : words.map((word) => word[0]).join("");
  if (!SIZE_CODE_PATTERN.test(candidate) || used.has(candidate)) return null;
  return candidate;
}

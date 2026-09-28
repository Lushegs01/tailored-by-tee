/*
 * A category's three-letter code: the second part of every SKU in it
 * ("TBT-SHR-KPL-SND-M" → SHR = Shirts). Pure: the form previews and suggests
 * codes with the same rules the server enforces.
 *
 * Once any product in the category has variants, their SKUs contain the code, so
 * it can no longer change (the server checks this inside the save transaction).
 */

export const CATEGORY_CODE_LENGTH = 3;

const CODE_PATTERN = /^[A-Z]{3}$/;

/** " shr " → "SHR". Doesn't validate. */
export function normaliseCategoryCode(input: string): string {
  return input.trim().toUpperCase();
}

/** Why a (normalised) code can't be used, or null when it can. */
export function categoryCodeProblem(code: string): string | null {
  if (code === "") return "Enter a three-letter code, e.g. SHR.";
  if (!CODE_PATTERN.test(code)) return "Use exactly three letters (A to Z), e.g. SHR.";
  return null;
}

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

/**
 * A starting suggestion from the name: its first letter, then the next
 * consonants ("Shirts" → "SHR", "Knitwear" → "KNT", "T-Shirts" → "TSH"), padded
 * with vowels for short names. Skips codes in `taken`. "" when the name has no letters.
 */
export function suggestCategoryCode(name: string, taken: Iterable<string> = []): string {
  const letters = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (letters === "") return "";
  const used = new Set(taken);

  const [first, ...rest] = letters;
  const consonants = rest.filter((letter) => !VOWELS.has(letter));
  const vowels = rest.filter((letter) => VOWELS.has(letter));
  const pool = [...consonants, ...vowels];

  const preferred = (first + pool.join("")).slice(0, CATEGORY_CODE_LENGTH).padEnd(CATEGORY_CODE_LENGTH, "X");
  if (!used.has(preferred)) return preferred;

  // Keep the first letter, try other pairs from the name in order.
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const candidate = `${first}${pool[i]}${pool[j]}`;
      if (!used.has(candidate)) return candidate;
    }
  }
  return preferred;
}

/** "SHR" in an example SKU, so the owner sees where the code goes. */
export function exampleSku(code: string): string {
  const shown = CODE_PATTERN.test(code) ? code : "???";
  return `TBT-${shown}-KPL-SND-M`;
}

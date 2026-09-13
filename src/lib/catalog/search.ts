import type { Product } from "./types";

/*
 * Catalogue search: normalisation, tokenising and scoring. Pure, so ranking can
 * be tested in isolation; the repository supplies the documents.
 */

export const MAX_QUERY_LENGTH = 64;

/** Lowercase, strip accents and apostrophes, collapse whitespace. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chunks of letters/digits, keeping hyphenated compounds such as "t-shirt" together. */
function chunks(normalized: string): string[] {
  return normalized.split(/[^a-z0-9-]+/).flatMap((chunk) => {
    const trimmed = chunk.replace(/^-+|-+$/g, "");
    return trimmed ? [trimmed] : [];
  });
}

/**
 * Words indexed for a field. Hyphenated compounds are indexed both joined and
 * split, so "Band-Collar" answers to "bandcollar", "band" and "collar".
 */
export function indexWords(value: string): string[] {
  const words = new Set<string>();
  for (const chunk of chunks(normalizeText(value))) {
    if (chunk.includes("-")) {
      words.add(chunk.replace(/-/g, ""));
      for (const part of chunk.split("-")) if (part) words.add(part);
    } else {
      words.add(chunk);
    }
  }
  return [...words];
}

/** Light plural folding: "shirts" → "shirt", but "dress" stays "dress". */
function singularize(token: string): string {
  return token.length > 3 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token;
}

/** The normalised query plus its tokens; empty when there is nothing to search for. */
export function parseQuery(raw: string): { normalized: string; tokens: string[] } {
  const normalized = normalizeText(raw.slice(0, MAX_QUERY_LENGTH));
  const tokens = [...new Set(chunks(normalized).map((chunk) => singularize(chunk.replace(/-/g, ""))))];
  return { normalized, tokens };
}

/* ── Documents & scoring ────────────────────────────────────────────────── */

export interface SearchDocument {
  productId: string;
  name: string;
  nameWords: string[];
  /** Tags, category, collections and colour names. */
  attributeWords: string[];
  materialWords: string[];
  /** Summary and description; matched on whole words only to limit noise. */
  proseWords: Set<string>;
  bestsellerRank: number | null;
  createdAt: string;
}

export interface SearchDocumentContext {
  categoryName: string;
  collectionNames: string[];
  colorNames: string[];
}

export function buildSearchDocument(product: Product, context: SearchDocumentContext): SearchDocument {
  const attributeText = [...product.tags, context.categoryName, ...context.collectionNames, ...context.colorNames];
  return {
    productId: product.id,
    name: normalizeText(product.name),
    nameWords: indexWords(product.name),
    attributeWords: [...new Set(attributeText.flatMap(indexWords))],
    materialWords: indexWords(product.material),
    proseWords: new Set([...indexWords(product.summary), ...indexWords(product.description)]),
    bestsellerRank: product.bestsellerRank,
    createdAt: product.createdAt,
  };
}

const SCORE = {
  nameStartsWith: 100,
  nameWord: 30,
  attribute: 12,
  material: 5,
  prose: 2,
} as const;

const hasPrefix = (words: readonly string[], token: string) => words.some((word) => word.startsWith(token));

/** Best field a single token matches, or 0 when it matches none. */
function scoreToken(document: SearchDocument, token: string): number {
  if (hasPrefix(document.nameWords, token)) return SCORE.nameWord;
  if (hasPrefix(document.attributeWords, token)) return SCORE.attribute;
  if (hasPrefix(document.materialWords, token)) return SCORE.material;
  if (token.length >= 3 && document.proseWords.has(token)) return SCORE.prose;
  return 0;
}

/** Every token must match somewhere (AND); returns null when the document is excluded. */
export function scoreDocument(document: SearchDocument, query: { normalized: string; tokens: string[] }): number | null {
  let score = document.name.startsWith(query.normalized) ? SCORE.nameStartsWith : 0;
  for (const token of query.tokens) {
    const tokenScore = scoreToken(document, token);
    if (tokenScore === 0) return null;
    score += tokenScore;
  }
  return score;
}

/** Ranks documents: score, then best-seller rank, then newest. */
export function rankDocuments(
  documents: readonly SearchDocument[],
  query: { normalized: string; tokens: string[] },
): SearchDocument[] {
  if (query.tokens.length === 0) return [];
  return documents
    .flatMap((document) => {
      const score = scoreDocument(document, query);
      return score === null ? [] : [{ document, score }];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.document.bestsellerRank ?? Infinity) - (b.document.bestsellerRank ?? Infinity) ||
        b.document.createdAt.localeCompare(a.document.createdAt),
    )
    .map(({ document }) => document);
}

/** True when every token prefixes a word of any given label (used for categories and collections). */
export function matchesLabels(labels: readonly string[], tokens: readonly string[]): boolean {
  if (tokens.length === 0) return false;
  const words = labels.flatMap(indexWords);
  return tokens.every((token) => hasPrefix(words, token));
}

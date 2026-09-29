/*
 * The admin list URL contract: /admin/orders?q=ada&status=PAID&sort=total&dir=asc&page=2
 *
 * Pure (no server or browser APIs), so server pages parse with it and links are
 * built with it. Every value is untrusted input: unknown keys are ignored, sorts
 * and filters must be on the page's allow-list, pages are clamped, and search
 * text is trimmed and capped. Nothing here throws on a malformed URL.
 */

/** Rows per admin list page. */
export const PAGE_SIZE = 25;

/** Past this, a page number is certainly a typo or a probe. */
export const MAX_PAGE = 10_000;

/** Longest search text kept (characters). */
export const MAX_QUERY_LENGTH = 100;

const MAX_FILTER_LENGTH = 100;

/** Names the list URL uses itself; they can't be filter names. */
const RESERVED_KEYS = new Set(["page", "q", "sort", "dir"]);

export type SortDir = "asc" | "desc";

/** A page's searchParams once awaited. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface ListParams {
  /** 1-based; clamp to the last page with `lastPage` once the total is known. */
  page: number;
  /** Trimmed search text, "" when none. */
  q: string;
  /** Always one of `allowed.sort`; the default when the URL gives none or an unknown one. */
  sort: string;
  dir: SortDir;
  /** Only allow-listed filter names with non-empty (and, when listed, allowed) values. */
  filters: Record<string, string>;
  /** The list's own default order; links leave it out of the URL. */
  defaults: { sort: string; dir: SortDir };
}

export interface ListParamsAllowed {
  /** Sortable column keys; the first is the default unless `defaultSort` says otherwise. */
  sort: readonly string[];
  /** Filter parameter names, e.g. ["status", "category"]. */
  filters: readonly string[];
  defaultSort?: string;
  /** Default "desc" (newest, largest first). */
  defaultDir?: SortDir;
  /** Optional allow-list of values per filter, e.g. { status: ["PAID", "SHIPPED"] }. */
  filterValues?: Readonly<Record<string, readonly string[]>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Collapses whitespace and removes control characters. */
function cleanText(value: string, max: number): string {
  let text = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    text += code < 32 || code === 127 ? " " : char;
  }
  return text.replace(/\s+/g, " ").trim().slice(0, max).trim();
}

/** Reads a list page's searchParams safely. `allowed` is the page's allow-list. */
export function parseListParams(
  searchParams: RawSearchParams | URLSearchParams,
  allowed: ListParamsAllowed,
): ListParams {
  const raw: RawSearchParams =
    searchParams instanceof URLSearchParams ? Object.fromEntries(searchParams.entries()) : searchParams;

  const defaultSort =
    allowed.defaultSort !== undefined && allowed.sort.includes(allowed.defaultSort)
      ? allowed.defaultSort
      : (allowed.sort[0] ?? "");
  const defaultDir: SortDir = allowed.defaultDir ?? "desc";

  const pageText = first(raw.page)?.trim() ?? "";
  const pageNumber = /^\d{1,6}$/.test(pageText) ? Number(pageText) : 1;
  const page = Math.min(Math.max(pageNumber, 1), MAX_PAGE);

  const q = cleanText(first(raw.q) ?? "", MAX_QUERY_LENGTH);

  const sortText = first(raw.sort)?.trim();
  const sort = sortText !== undefined && allowed.sort.includes(sortText) ? sortText : defaultSort;

  const dirText = first(raw.dir)?.trim().toLowerCase();
  const dir: SortDir = dirText === "asc" || dirText === "desc" ? dirText : defaultDir;

  const filters: Record<string, string> = {};
  for (const name of allowed.filters) {
    if (RESERVED_KEYS.has(name)) continue;
    const value = cleanText(first(raw[name]) ?? "", MAX_FILTER_LENGTH);
    if (!value) continue;
    const values = allowed.filterValues?.[name];
    if (values && !values.includes(value)) continue;
    filters[name] = value;
  }

  return { page, q, sort, dir, filters, defaults: { sort: defaultSort, dir: defaultDir } };
}

export interface ListHrefOverrides {
  page?: number;
  /** null or "" clears the search. */
  q?: string | null;
  sort?: string;
  dir?: SortDir;
  /** Merged over the current filters; null or "" removes one. */
  filters?: Record<string, string | null | undefined>;
  /** Drops every filter and the search (sort is kept) before applying the rest. */
  clear?: boolean;
}

/**
 * A link to the same list with some parameters changed. Changing the search,
 * sort or filters goes back to page 1 unless `page` is given too. Defaults are
 * left out, so URLs stay short and canonical:
 *   buildListHref("/admin/orders", params, { filters: { status: "PAID" } })
 *   → "/admin/orders?status=PAID"
 */
export function buildListHref(base: string, params: ListParams, overrides: ListHrefOverrides = {}): string {
  const resetsPage =
    overrides.q !== undefined ||
    overrides.sort !== undefined ||
    overrides.dir !== undefined ||
    overrides.filters !== undefined ||
    overrides.clear === true;

  const q = overrides.clear ? (overrides.q ?? "") : overrides.q !== undefined ? (overrides.q ?? "") : params.q;
  const filters: Record<string, string> = overrides.clear ? {} : { ...params.filters };
  for (const [name, value] of Object.entries(overrides.filters ?? {})) {
    if (RESERVED_KEYS.has(name)) continue;
    if (value === null || value === undefined || value === "") delete filters[name];
    else filters[name] = value;
  }
  const sort = overrides.sort ?? params.sort;
  const dir = overrides.dir ?? params.dir;
  const page = overrides.page ?? (resetsPage ? 1 : params.page);

  const search = new URLSearchParams();
  const text = q.trim();
  if (text) search.set("q", text);
  for (const [name, value] of Object.entries(filters)) search.set(name, value);
  const isDefaultOrder = sort === params.defaults.sort && dir === params.defaults.dir;
  if (!isDefaultOrder) {
    search.set("sort", sort);
    search.set("dir", dir);
  }
  if (page > 1) search.set("page", String(Math.min(Math.floor(page), MAX_PAGE)));

  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * The link for a sortable column header: the first click sorts by `column` in
 * `firstDir`; clicking the current column flips the direction.
 */
export function buildSortHref(base: string, params: ListParams, column: string, firstDir: SortDir = "asc"): string {
  const dir: SortDir = params.sort === column ? (params.dir === "asc" ? "desc" : "asc") : firstDir;
  return buildListHref(base, params, { sort: column, dir });
}

/** The current direction of `column` for aria-sort, or null when the list isn't sorted by it. */
export function sortDirectionFor(params: ListParams, column: string): SortDir | null {
  return params.sort === column ? params.dir : null;
}

/** The last page for `total` rows (at least 1). */
export function lastPage(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/** Rows to skip for `page` — for Prisma's `skip`. */
export function pageOffset(page: number, pageSize: number = PAGE_SIZE): number {
  return (Math.max(1, Math.floor(page)) - 1) * pageSize;
}

/** "Showing 26–50 of 213": the 1-based first and last row on `page`, or zeros when empty. */
export function pageRange(page: number, total: number, pageSize: number = PAGE_SIZE): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const current = Math.min(Math.max(1, Math.floor(page)), lastPage(total, pageSize));
  const from = (current - 1) * pageSize + 1;
  return { from, to: Math.min(current * pageSize, total) };
}

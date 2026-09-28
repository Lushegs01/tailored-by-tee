import type { Prisma } from "@/generated/prisma/client";
import {
  buildListHref,
  parseListParams,
  type ListParams,
  type ListParamsAllowed,
  type RawSearchParams,
  type SortDir,
} from "@/lib/admin/pagination";

/*
 * Review moderation rules for /admin/reviews: the list's URL contract, the
 * database filter it maps to, which reviews a moderation step actually changes,
 * and the owner-facing wording. Pure (no server or browser APIs), so the page,
 * the server actions, the client controls and the tests all agree.
 *
 * Only APPROVED reviews may ever be shown to customers, and demo reviews
 * (Review.isDemo) never as genuine ones. Moderation only moves a review between
 * the three statuses (or deletes it); it never edits what the customer wrote.
 */

export const REVIEWS_PATH = "/admin/reviews";

export const REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ReviewStatusValue = (typeof REVIEW_STATUSES)[number];

/** The list's tabs: one per status, plus every review. */
export type ReviewTab = ReviewStatusValue | "ALL";
export const REVIEW_TAB_ALL = "ALL";
export const DEFAULT_REVIEW_TAB: ReviewTab = "PENDING";

export const REVIEW_TABS: readonly { value: ReviewTab; label: string }[] = [
  { value: "PENDING", label: "Waiting for approval" },
  { value: "APPROVED", label: "Published" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All reviews" },
];

/**
 * Whether product pages show approved reviews yet. They don't until Phase 10
 * (src/components/product/product-reviews.tsx says "No reviews yet"); while this
 * is false the reviews page says so. Flip it when they do.
 */
export const STOREFRONT_SHOWS_REVIEWS = false;

/**
 * The only reviews a customer may ever see: approved by an admin, and not demo
 * content. For the storefront's review display (Phase 10) — nothing outside this
 * filter should reach a product page.
 */
export const CUSTOMER_VISIBLE_REVIEW_WHERE = {
  status: "APPROVED",
  isDemo: false,
} as const satisfies Prisma.ReviewWhereInput;

/** Most reviews one moderation step may touch (a page holds 25). */
export const MAX_BULK_REVIEWS = 100;

/** A review body longer than this starts folded, with "Show the full review". */
export const LONG_REVIEW_CHARACTERS = 600;
const LONG_REVIEW_LINES = 8;

/* ── The list URL ──────────────────────────────────────────────────────── */

export const REVIEW_SORTS = ["createdAt", "rating"] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

/** The sort menu: "<sort>:<dir>" values. The first is the default. */
export const REVIEW_SORT_OPTIONS: readonly { value: `${ReviewSort}:${SortDir}`; label: string }[] = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "rating:asc", label: "Lowest rating first" },
  { value: "rating:desc", label: "Highest rating first" },
];

export const RATING_FILTER_OPTIONS: readonly { value: string; label: string }[] = [5, 4, 3, 2, 1].map(
  (stars) => ({
    value: String(stars),
    label: stars === 1 ? "1 star" : `${stars} stars`,
  }),
);

export const DEMO_FILTER_OPTIONS: readonly { value: "hide" | "only"; label: string }[] = [
  { value: "hide", label: "Hide demo content" },
  { value: "only", label: "Demo content only" },
];

export const VERIFIED_FILTER_OPTIONS: readonly { value: "yes" | "no"; label: string }[] = [
  { value: "yes", label: "Verified purchases" },
  { value: "no", label: "Not verified" },
];

const PRODUCT_ID = /^[A-Za-z0-9_.:-]{1,191}$/;

const REVIEW_LIST_ALLOWED: ListParamsAllowed = {
  sort: REVIEW_SORTS,
  filters: ["status", "rating", "demo", "verified", "product"],
  defaultSort: "createdAt",
  defaultDir: "desc",
  filterValues: {
    status: [...REVIEW_STATUSES, REVIEW_TAB_ALL],
    rating: RATING_FILTER_OPTIONS.map((option) => option.value),
    demo: DEMO_FILTER_OPTIONS.map((option) => option.value),
    verified: VERIFIED_FILTER_OPTIONS.map((option) => option.value),
  },
};

/**
 * Reads /admin/reviews?status=APPROVED&rating=1&demo=hide&verified=yes&product=<id>&q=…
 * safely. The default tab (waiting for approval) is left out of `filters`, so
 * links stay canonical whether or not the URL named it.
 */
export function parseReviewListParams(searchParams: RawSearchParams | URLSearchParams): ListParams {
  const params = parseListParams(searchParams, REVIEW_LIST_ALLOWED);
  const filters = { ...params.filters };
  if (filters.status === DEFAULT_REVIEW_TAB) delete filters.status;
  if (filters.product !== undefined && !PRODUCT_ID.test(filters.product)) delete filters.product;
  return { ...params, filters };
}

export interface ReviewListQuery {
  tab: ReviewTab;
  /** Product name or code, review title or text, the reviewer's name or account email. */
  q: string;
  rating: number | null;
  demo: "hide" | "only" | null;
  verified: boolean | null;
  productId: string | null;
  sort: ReviewSort;
  dir: SortDir;
  page: number;
}

function isReviewTab(value: string | undefined): value is ReviewTab {
  return value === REVIEW_TAB_ALL || (REVIEW_STATUSES as readonly string[]).includes(value ?? "");
}

/** The parsed URL as a database query. */
export function toReviewListQuery(params: ListParams): ReviewListQuery {
  const { filters } = params;
  const rating = Number(filters.rating);
  return {
    tab: isReviewTab(filters.status) ? filters.status : DEFAULT_REVIEW_TAB,
    q: params.q,
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    demo: filters.demo === "hide" || filters.demo === "only" ? filters.demo : null,
    verified: filters.verified === "yes" ? true : filters.verified === "no" ? false : null,
    productId: filters.product ?? null,
    sort: params.sort === "rating" ? "rating" : "createdAt",
    dir: params.dir,
    page: params.page,
  };
}

/** Everything except the status tab, so each tab's count can be read in one grouped query. */
export function reviewFilterWhere(query: ReviewListQuery): Prisma.ReviewWhereInput {
  const and: Prisma.ReviewWhereInput[] = [];

  if (query.rating !== null) and.push({ rating: query.rating });
  if (query.demo === "hide") and.push({ isDemo: false });
  if (query.demo === "only") and.push({ isDemo: true });
  if (query.verified !== null) and.push({ isVerifiedPurchase: query.verified });
  if (query.productId) and.push({ productId: query.productId });

  const text = query.q.trim();
  if (text) {
    const contains = { contains: text, mode: "insensitive" as const };
    and.push({
      OR: [
        { product: { name: contains } },
        { product: { code: { equals: text, mode: "insensitive" } } },
        { title: contains },
        { body: contains },
        { displayName: contains },
        { user: { email: contains } },
      ],
    });
  }

  return and.length === 0 ? {} : and.length === 1 ? and[0] : { AND: and };
}

/** The filter for one tab ({} for "All reviews"). */
export function reviewTabWhere(tab: ReviewTab): Prisma.ReviewWhereInput {
  return tab === REVIEW_TAB_ALL ? {} : { status: tab };
}

/** Newest first by default; ties broken by id so pages never overlap. */
export function reviewOrderBy(
  query: Pick<ReviewListQuery, "sort" | "dir">,
): Prisma.ReviewOrderByWithRelationInput[] {
  if (query.sort === "rating") return [{ rating: query.dir }, { createdAt: "desc" }, { id: "desc" }];
  return [{ createdAt: query.dir }, { id: query.dir }];
}

/** The link for a tab: keeps the search and filters, back to page 1. */
export function reviewTabHref(params: ListParams, tab: ReviewTab): string {
  return buildListHref(REVIEWS_PATH, params, {
    filters: { status: tab === DEFAULT_REVIEW_TAB ? null : tab },
  });
}

/** The current tab from parsed params. */
export function currentReviewTab(params: ListParams): ReviewTab {
  const status = params.filters.status;
  return isReviewTab(status) ? status : DEFAULT_REVIEW_TAB;
}

/** A search or a filter other than the tab is narrowing the list. */
export function hasReviewFilters(params: ListParams): boolean {
  return params.q !== "" || Object.keys(params.filters).some((name) => name !== "status");
}

/** Each tab's count; "ALL" is their sum. */
export type ReviewTabCounts = Record<ReviewTab, number>;

export function reviewTabCounts(groups: readonly { status: string; count: number }[]): ReviewTabCounts {
  const counts: ReviewTabCounts = { PENDING: 0, APPROVED: 0, REJECTED: 0, ALL: 0 };
  for (const group of groups) {
    if (!(REVIEW_STATUSES as readonly string[]).includes(group.status)) continue;
    const count = Math.max(0, Math.floor(group.count)) || 0;
    counts[group.status as ReviewStatusValue] += count;
    counts.ALL += count;
  }
  return counts;
}

/** The sort menu's current value, e.g. "rating:asc". */
export function reviewSortValue(params: Pick<ListParams, "sort" | "dir">): string {
  const value = `${params.sort}:${params.dir}`;
  return REVIEW_SORT_OPTIONS.some((option) => option.value === value) ? value : REVIEW_SORT_OPTIONS[0].value;
}

/* ── Moderation ────────────────────────────────────────────────────────── */

/** A review as the admin saw it: moderation only applies if it's still in this status. */
export interface ReviewRef {
  id: string;
  status: ReviewStatusValue;
}

/** Keeps the first mention of each id. */
export function dedupeReviewRefs<T extends { id: string }>(refs: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const ref of refs) {
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    result.push(ref);
  }
  return result;
}

export interface ReviewGroup {
  from: ReviewStatusValue;
  ids: string[];
}

/** Reviews grouped by the status the admin saw, in a fixed order (for one conditional update per status). */
export function groupReviewsByStatus(refs: readonly ReviewRef[]): ReviewGroup[] {
  const unique = dedupeReviewRefs(refs);
  return REVIEW_STATUSES.map((from) => ({
    from,
    ids: unique.filter((ref) => ref.status === from).map((ref) => ref.id),
  })).filter((group) => group.ids.length > 0);
}

export interface ModerationPlan {
  /** One conditional update per status the admin saw. */
  groups: ReviewGroup[];
  /** Already in the target status: nothing to do. */
  unchanged: string[];
}

/** Which of the chosen reviews moving to `to` would change, grouped by the status the admin saw. */
export function planModeration(refs: readonly ReviewRef[], to: ReviewStatusValue): ModerationPlan {
  const unique = dedupeReviewRefs(refs);
  return {
    groups: groupReviewsByStatus(unique.filter((ref) => ref.status !== to)),
    unchanged: unique.filter((ref) => ref.status === to).map((ref) => ref.id),
  };
}

/** Whether moving from `from` to `to` changes what customers can see. */
export function changesWhatCustomersSee(from: ReviewStatusValue, to: ReviewStatusValue | null): boolean {
  return (from === "APPROVED") !== (to === "APPROVED");
}

export interface ModerationStep {
  /** Button text: "Approve". */
  verb: string;
  pendingLabel: string;
  /** "Approved" (a single review) — the rest of the sentence comes from the message helpers. */
  past: string;
  /** "already published" */
  already: string;
  /** Audit action. */
  auditAction: string;
}

export const MODERATION_STEPS: Record<ReviewStatusValue, ModerationStep> = {
  APPROVED: {
    verb: "Approve",
    pendingLabel: "Approving…",
    past: "Approved",
    already: "already published",
    auditAction: "review.approve",
  },
  REJECTED: {
    verb: "Reject",
    pendingLabel: "Rejecting…",
    past: "Rejected",
    already: "already rejected",
    auditAction: "review.reject",
  },
  PENDING: {
    verb: "Return to waiting",
    pendingLabel: "Moving…",
    past: "Returned",
    already: "already waiting for approval",
    auditAction: "review.status",
  },
};

export const DELETE_AUDIT_ACTION = "review.delete";

/** What a moderation step returns to the browser. */
export interface ModerationOutcome {
  to: ReviewStatusValue;
  /** The reviews that moved, and the status each came from (for "Undo"). */
  changed: { id: string; from: ReviewStatusValue }[];
  /** Already in the target status. */
  unchanged: number;
  /** Changed by someone else since the page loaded, so left alone. */
  stale: number;
}

export interface DeletionOutcome {
  deleted: string[];
  stale: number;
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** "Ada’s review of Linen Shirt" — or "a review of Linen Shirt" without a name. Used after a verb. */
export function reviewLabel(displayName: string, productName: string): string {
  const name = clip(displayName, 40);
  const product = clip(productName, 80) || "a product";
  return name ? `${name}’s review of ${product}` : `a review of ${product}`;
}

function reviewsWord(count: number): string {
  return count === 1 ? "1 review" : `${count} reviews`;
}

function staleNote(stale: number): string {
  if (stale <= 0) return "";
  return stale === 1
    ? " 1 had already been changed by someone else, so it was left as it is."
    : ` ${stale} had already been changed by someone else, so they were left as they are.`;
}

function unchangedNote(unchanged: number, to: ReviewStatusValue): string {
  if (unchanged <= 0) return "";
  return ` ${unchanged} ${unchanged === 1 ? "was" : "were"} ${MODERATION_STEPS[to].already}.`;
}

/** "Approved Ada’s review of Linen Shirt." / "Returned 3 reviews to waiting for approval." */
function changedSentence(to: ReviewStatusValue, changedLabels: readonly string[]): string {
  const what = changedLabels.length === 1 ? changedLabels[0] : reviewsWord(changedLabels.length);
  const step = MODERATION_STEPS[to];
  return to === "PENDING" ? `${step.past} ${what} to waiting for approval.` : `${step.past} ${what}.`;
}

/**
 * The owner-facing result of a moderation step. `ok` is false when nothing
 * changed, with the reason.
 */
export function moderationMessage(input: {
  to: ReviewStatusValue;
  changedLabels: readonly string[];
  unchanged: number;
  stale: number;
}): { ok: boolean; message: string } {
  const { to, changedLabels, unchanged, stale } = input;
  if (changedLabels.length > 0) {
    return {
      ok: true,
      message: `${changedSentence(to, changedLabels)}${unchangedNote(unchanged, to)}${staleNote(stale)}`,
    };
  }
  if (stale > 0) {
    const these = stale + unchanged === 1 ? "This review had" : "These reviews had";
    return {
      ok: false,
      message: `Nothing was changed. ${these} already been changed by someone else. The list now shows the latest.`,
    };
  }
  return {
    ok: false,
    message:
      unchanged === 1
        ? `Nothing to change: this review is ${MODERATION_STEPS[to].already}.`
        : `Nothing to change: these reviews are ${MODERATION_STEPS[to].already}.`,
  };
}

/** "Deleted Ada’s review of Linen Shirt." / "Deleted 3 reviews." */
export function deletionMessage(input: { deletedLabels: readonly string[]; stale: number }): {
  ok: boolean;
  message: string;
} {
  const { deletedLabels, stale } = input;
  if (deletedLabels.length > 0) {
    const what = deletedLabels.length === 1 ? deletedLabels[0] : reviewsWord(deletedLabels.length);
    return { ok: true, message: `Deleted ${what}.${staleNote(stale)}` };
  }
  return {
    ok: false,
    message: `Nothing was deleted. ${stale === 1 ? "This review had" : "These reviews had"} already been changed by someone else. The list now shows the latest — check it and try again.`,
  };
}

/** One sentence for the admin activity list. */
export function moderationAuditSummary(
  to: ReviewStatusValue,
  changed: readonly { title: string; label: string }[],
): string {
  const step = MODERATION_STEPS[to];
  if (changed.length === 1) {
    const [review] = changed;
    const title = clip(review.title, 80);
    const titled = title ? ` “${title}”` : "";
    const detail = `${review.label}${titled}`;
    return to === "PENDING" ? `${step.past} ${detail} to waiting for approval.` : `${step.past} ${detail}.`;
  }
  return changedSentence(
    to,
    changed.map((review) => review.label),
  );
}

export function deletionAuditSummary(
  deleted: readonly { title: string; label: string; rating: number }[],
): string {
  if (deleted.length === 1) {
    const [review] = deleted;
    const title = clip(review.title, 80);
    return `Deleted ${review.label}${title ? ` “${title}”` : ""} (${ratingText(review.rating).toLowerCase()}).`;
  }
  return `Deleted ${reviewsWord(deleted.length)}.`;
}

/* ── Display ───────────────────────────────────────────────────────────── */

/** A review's element id on the page, so focus can find its way back after a change. */
export function reviewElementId(id: string): string {
  return `review-${id}`;
}

/** The list's heading: where focus goes when the review or bar it was on has gone. */
export const REVIEW_LIST_HEADING_ID = "review-list-heading";

/** A rating clamped to 1–5 (the database enforces this too). */
export function clampRating(rating: number): number {
  return Number.isFinite(rating) ? Math.min(5, Math.max(1, Math.round(rating))) : 1;
}

/** "Rated 4 out of 5". */
export function ratingText(rating: number): string {
  return `Rated ${clampRating(rating)} out of 5`;
}

/** A body long enough to start folded. */
export function isLongReviewBody(body: string): boolean {
  return body.length > LONG_REVIEW_CHARACTERS || body.split("\n").length > LONG_REVIEW_LINES;
}

/**
 * Who last moderated a review, in words: "Approved by you", "Rejected by
 * ada@example.com", "Returned to waiting by Tee". Null for a review nobody has
 * moderated yet.
 */
export function moderationByline(input: {
  status: ReviewStatusValue;
  moderatedAt: Date | string | null;
  moderator: { id: string; name: string | null; email: string } | null;
  currentAdminId: string;
}): string | null {
  if (!input.moderatedAt) return null;
  const verb =
    input.status === "APPROVED"
      ? "Approved"
      : input.status === "REJECTED"
        ? "Rejected"
        : "Returned to waiting";
  if (!input.moderator) return verb;
  if (input.moderator.id === input.currentAdminId) return `${verb} by you`;
  return `${verb} by ${input.moderator.name?.trim() || input.moderator.email}`;
}

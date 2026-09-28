import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CUSTOMER_VISIBLE_REVIEW_WHERE,
  MODERATION_STEPS,
  changesWhatCustomersSee,
  clampRating,
  currentReviewTab,
  dedupeReviewRefs,
  deletionAuditSummary,
  deletionMessage,
  groupReviewsByStatus,
  hasReviewFilters,
  isLongReviewBody,
  moderationAuditSummary,
  moderationByline,
  moderationMessage,
  parseReviewListParams,
  planModeration,
  ratingText,
  reviewFilterWhere,
  reviewLabel,
  reviewOrderBy,
  reviewSortValue,
  reviewTabCounts,
  reviewTabHref,
  reviewTabWhere,
  toReviewListQuery,
  type ReviewRef,
} from "./review-rules";

describe("parseReviewListParams / toReviewListQuery", () => {
  it("defaults to the waiting tab, newest first, page 1", () => {
    const params = parseReviewListParams({});
    assert.deepEqual(params.filters, {});
    assert.equal(params.sort, "createdAt");
    assert.equal(params.dir, "desc");
    const query = toReviewListQuery(params);
    assert.equal(query.tab, "PENDING");
    assert.equal(query.rating, null);
    assert.equal(query.demo, null);
    assert.equal(query.verified, null);
    assert.equal(query.productId, null);
    assert.equal(query.page, 1);
  });

  it("treats ?status=PENDING as the default tab, so links stay canonical", () => {
    const params = parseReviewListParams({ status: "PENDING" });
    assert.deepEqual(params.filters, {});
    assert.equal(currentReviewTab(params), "PENDING");
  });

  it("reads every filter", () => {
    const params = parseReviewListParams({
      status: "APPROVED",
      rating: "2",
      demo: "hide",
      verified: "no",
      product: "prod_knitted-polo",
      q: "  linen  ",
      sort: "rating",
      dir: "asc",
      page: "3",
    });
    const query = toReviewListQuery(params);
    assert.equal(query.tab, "APPROVED");
    assert.equal(query.rating, 2);
    assert.equal(query.demo, "hide");
    assert.equal(query.verified, false);
    assert.equal(query.productId, "prod_knitted-polo");
    assert.equal(query.q, "linen");
    assert.equal(query.sort, "rating");
    assert.equal(query.dir, "asc");
    assert.equal(query.page, 3);
  });

  it("ignores unknown or unsafe values", () => {
    const params = parseReviewListParams({
      status: "DELETED",
      rating: "6",
      demo: "yes",
      verified: "maybe",
      product: "x'; DROP TABLE",
      sort: "displayName",
    });
    assert.deepEqual(params.filters, {});
    const query = toReviewListQuery(params);
    assert.equal(query.tab, "PENDING");
    assert.equal(query.rating, null);
    assert.equal(query.sort, "createdAt");
  });

  it("accepts the All tab", () => {
    assert.equal(toReviewListQuery(parseReviewListParams({ status: "ALL" })).tab, "ALL");
  });

  it("only keeps a product id that could be one", () => {
    // The id reaches Prisma as a parameter, but a value that can't be an id is a
    // probe rather than a link: drop it and show every product.
    for (const product of ["x'; DROP TABLE", "a b", "../../etc", "p/q", ""]) {
      assert.equal(parseReviewListParams({ product }).filters.product, undefined, product);
    }
    assert.equal(parseReviewListParams({ product: "cmf_9k2.a-b:c" }).filters.product, "cmf_9k2.a-b:c");
    // A very long id is capped rather than dropped, so it simply matches nothing
    // and the page offers "Show every product".
    assert.equal(parseReviewListParams({ product: "p".repeat(200) }).filters.product?.length, 100);
  });

  it("takes the first value when a parameter is repeated", () => {
    const query = toReviewListQuery(parseReviewListParams({ status: ["REJECTED", "APPROVED"], rating: ["4", "1"] }));
    assert.equal(query.tab, "REJECTED");
    assert.equal(query.rating, 4);
  });
});

describe("reviewFilterWhere / reviewTabWhere / reviewOrderBy", () => {
  const base = toReviewListQuery(parseReviewListParams({}));

  it("is empty without filters", () => {
    assert.deepEqual(reviewFilterWhere(base), {});
  });

  it("combines filters with AND", () => {
    const where = reviewFilterWhere({ ...base, rating: 1, demo: "only", verified: true, productId: "p1" });
    assert.deepEqual(where, {
      AND: [{ rating: 1 }, { isDemo: true }, { isVerifiedPurchase: true }, { productId: "p1" }],
    });
  });

  it("hides demo content with demo=hide", () => {
    assert.deepEqual(reviewFilterWhere({ ...base, demo: "hide" }), { isDemo: false });
  });

  it("searches product, title, text, name and account email, case-insensitively", () => {
    const where = reviewFilterWhere({ ...base, q: "Linen" });
    assert.ok("OR" in where && Array.isArray(where.OR));
    const or = where.OR!;
    assert.equal(or.length, 6);
    assert.deepEqual(or[0], { product: { name: { contains: "Linen", mode: "insensitive" } } });
    assert.deepEqual(or[5], { user: { email: { contains: "Linen", mode: "insensitive" } } });
  });

  it("filters by tab status, and not at all for All", () => {
    assert.deepEqual(reviewTabWhere("REJECTED"), { status: "REJECTED" });
    assert.deepEqual(reviewTabWhere("ALL"), {});
  });

  it("orders with a tie-breaker so pages never overlap", () => {
    assert.deepEqual(reviewOrderBy({ sort: "createdAt", dir: "desc" }), [
      { createdAt: "desc" },
      { id: "desc" },
    ]);
    assert.deepEqual(reviewOrderBy({ sort: "rating", dir: "asc" }), [
      { rating: "asc" },
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });
});

describe("tabs and links", () => {
  it("keeps the search and filters and resets the page when switching tabs", () => {
    const params = parseReviewListParams({ q: "polo", rating: "5", page: "4" });
    assert.equal(reviewTabHref(params, "APPROVED"), "/admin/reviews?q=polo&rating=5&status=APPROVED");
    const onApproved = parseReviewListParams({ status: "APPROVED", q: "polo" });
    assert.equal(reviewTabHref(onApproved, "PENDING"), "/admin/reviews?q=polo");
  });

  it("knows when the list is narrowed beyond the tab", () => {
    assert.equal(hasReviewFilters(parseReviewListParams({ status: "REJECTED" })), false);
    assert.equal(hasReviewFilters(parseReviewListParams({ demo: "only" })), true);
    assert.equal(hasReviewFilters(parseReviewListParams({ q: "x" })), true);
  });

  it("keeps the product filter when switching tabs", () => {
    const onAll = parseReviewListParams({ status: "ALL", product: "p1" });
    assert.equal(reviewTabHref(onAll, "REJECTED"), "/admin/reviews?status=REJECTED&product=p1");
    // Back to the default tab: the tab leaves the URL, the product stays.
    assert.equal(reviewTabHref(onAll, "PENDING"), "/admin/reviews?product=p1");
  });

  it("counts each tab and their total, ignoring unknown statuses", () => {
    assert.deepEqual(
      reviewTabCounts([
        { status: "PENDING", count: 3 },
        { status: "APPROVED", count: 10 },
        { status: "SPAM", count: 99 },
      ]),
      { PENDING: 3, APPROVED: 10, REJECTED: 0, ALL: 13 },
    );
  });

  it("never lets a strange count become a strange badge", () => {
    assert.deepEqual(
      reviewTabCounts([
        { status: "PENDING", count: -5 },
        { status: "APPROVED", count: 2.7 },
        { status: "REJECTED", count: Number.NaN },
      ]),
      { PENDING: 0, APPROVED: 2, REJECTED: 0, ALL: 2 },
    );
  });

  it("reports the sort menu's value, falling back to newest first", () => {
    assert.equal(reviewSortValue({ sort: "rating", dir: "asc" }), "rating:asc");
    assert.equal(reviewSortValue({ sort: "createdAt", dir: "desc" }), "createdAt:desc");
    assert.equal(reviewSortValue({ sort: "nope", dir: "asc" }), "createdAt:desc");
  });
});

describe("planModeration", () => {
  const refs: ReviewRef[] = [
    { id: "a", status: "PENDING" },
    { id: "b", status: "APPROVED" },
    { id: "c", status: "REJECTED" },
    { id: "d", status: "PENDING" },
    { id: "a", status: "APPROVED" },
  ];

  it("dedupes by id, keeping the first mention", () => {
    assert.deepEqual(
      dedupeReviewRefs(refs).map((ref) => `${ref.id}:${ref.status}`),
      ["a:PENDING", "b:APPROVED", "c:REJECTED", "d:PENDING"],
    );
  });

  it("groups by the status the admin saw, in a fixed order", () => {
    assert.deepEqual(groupReviewsByStatus(refs), [
      { from: "PENDING", ids: ["a", "d"] },
      { from: "APPROVED", ids: ["b"] },
      { from: "REJECTED", ids: ["c"] },
    ]);
  });

  it("leaves reviews already in the target status alone", () => {
    assert.deepEqual(planModeration(refs, "APPROVED"), {
      groups: [
        { from: "PENDING", ids: ["a", "d"] },
        { from: "REJECTED", ids: ["c"] },
      ],
      unchanged: ["b"],
    });
    assert.deepEqual(planModeration([{ id: "x", status: "PENDING" }], "PENDING"), {
      groups: [],
      unchanged: ["x"],
    });
  });

  it("plans nothing for an empty selection", () => {
    assert.deepEqual(planModeration([], "APPROVED"), { groups: [], unchanged: [] });
    assert.deepEqual(groupReviewsByStatus([]), []);
  });

  it("knows which steps change what customers see", () => {
    assert.equal(changesWhatCustomersSee("PENDING", "APPROVED"), true);
    assert.equal(changesWhatCustomersSee("APPROVED", "REJECTED"), true);
    assert.equal(changesWhatCustomersSee("APPROVED", null), true);
    assert.equal(changesWhatCustomersSee("PENDING", "REJECTED"), false);
    assert.equal(changesWhatCustomersSee("REJECTED", null), false);
  });
});

describe("messages", () => {
  it("names a single review", () => {
    assert.equal(reviewLabel("Ada", "Linen Shirt"), "Ada’s review of Linen Shirt");
    assert.equal(reviewLabel("  ", "Linen Shirt"), "a review of Linen Shirt");
    assert.ok(reviewLabel("x".repeat(100), "Polo").length < 60);
    // A product deleted in the same breath as its review still reads as a sentence.
    assert.equal(reviewLabel("Ada", ""), "Ada’s review of a product");
    assert.equal(reviewLabel("", ""), "a review of a product");
    assert.equal(reviewLabel("Ada\nOkoye", "Linen\tShirt"), "Ada Okoye’s review of Linen Shirt");
  });

  it("reports a single step", () => {
    assert.deepEqual(
      moderationMessage({
        to: "APPROVED",
        changedLabels: ["Ada’s review of Linen Shirt"],
        unchanged: 0,
        stale: 0,
      }),
      { ok: true, message: "Approved Ada’s review of Linen Shirt." },
    );
    assert.equal(
      moderationMessage({ to: "PENDING", changedLabels: ["Ada’s review of Polo"], unchanged: 0, stale: 0 })
        .message,
      "Returned Ada’s review of Polo to waiting for approval.",
    );
  });

  it("reports a bulk step with what was skipped", () => {
    assert.deepEqual(
      moderationMessage({ to: "REJECTED", changedLabels: ["a", "b", "c"], unchanged: 1, stale: 2 }),
      {
        ok: true,
        message:
          "Rejected 3 reviews. 1 was already rejected. 2 had already been changed by someone else, so they were left as they are.",
      },
    );
  });

  it("fails when nothing changed, saying why", () => {
    const stale = moderationMessage({ to: "APPROVED", changedLabels: [], unchanged: 0, stale: 1 });
    assert.equal(stale.ok, false);
    assert.match(stale.message, /already been changed by someone else/);
    const already = moderationMessage({ to: "APPROVED", changedLabels: [], unchanged: 2, stale: 0 });
    assert.equal(already.ok, false);
    assert.equal(already.message, "Nothing to change: these reviews are already published.");
  });

  it("reports deletions", () => {
    assert.deepEqual(deletionMessage({ deletedLabels: ["Ada’s review of Polo"], stale: 0 }), {
      ok: true,
      message: "Deleted Ada’s review of Polo.",
    });
    assert.equal(
      deletionMessage({ deletedLabels: ["a", "b"], stale: 1 }).message.startsWith("Deleted 2 reviews. 1 had"),
      true,
    );
    assert.equal(deletionMessage({ deletedLabels: [], stale: 2 }).ok, false);
  });

  it("writes audit summaries without the review text", () => {
    assert.equal(
      moderationAuditSummary("APPROVED", [
        { title: "Beautiful linen", label: "Ada’s review of Linen Shirt" },
      ]),
      "Approved Ada’s review of Linen Shirt “Beautiful linen”.",
    );
    assert.equal(
      moderationAuditSummary("REJECTED", [
        { title: "a", label: "x" },
        { title: "b", label: "y" },
      ]),
      "Rejected 2 reviews.",
    );
    assert.equal(
      deletionAuditSummary([{ title: "", label: "a review of Polo", rating: 1 }]),
      "Deleted a review of Polo (rated 1 out of 5).",
    );
    assert.ok(moderationAuditSummary("APPROVED", [{ title: "t".repeat(400), label: "x" }]).length <= 500);
  });

  it("has an audit action per step", () => {
    assert.equal(MODERATION_STEPS.APPROVED.auditAction, "review.approve");
    assert.equal(MODERATION_STEPS.REJECTED.auditAction, "review.reject");
    assert.equal(MODERATION_STEPS.PENDING.auditAction, "review.status");
  });
});

describe("what customers may see", () => {
  it("is approved, non-demo reviews only", () => {
    assert.deepEqual(CUSTOMER_VISIBLE_REVIEW_WHERE, { status: "APPROVED", isDemo: false });
  });
});

describe("display helpers", () => {
  it("reads ratings aloud and clamps them", () => {
    assert.equal(ratingText(4), "Rated 4 out of 5");
    assert.equal(clampRating(9), 5);
    assert.equal(clampRating(0), 1);
    assert.equal(clampRating(Number.NaN), 1);
  });

  it("folds long reviews", () => {
    assert.equal(isLongReviewBody("Lovely fit."), false);
    assert.equal(isLongReviewBody("x".repeat(601)), true);
    assert.equal(isLongReviewBody("a\nb\nc\nd\ne\nf\ng\nh\ni"), true);
  });

  it("says who moderated a review", () => {
    const moderator = { id: "u1", name: "Tee", email: "tee@example.com" };
    const at = new Date("2026-09-20T10:00:00Z");
    assert.equal(
      moderationByline({ status: "APPROVED", moderatedAt: at, moderator, currentAdminId: "u1" }),
      "Approved by you",
    );
    assert.equal(
      moderationByline({ status: "REJECTED", moderatedAt: at, moderator, currentAdminId: "u2" }),
      "Rejected by Tee",
    );
    assert.equal(
      moderationByline({
        status: "PENDING",
        moderatedAt: at,
        moderator: { ...moderator, name: null },
        currentAdminId: "u2",
      }),
      "Returned to waiting by tee@example.com",
    );
    assert.equal(
      moderationByline({
        status: "APPROVED",
        moderatedAt: at,
        moderator: { ...moderator, name: "   " },
        currentAdminId: "u2",
      }),
      "Approved by tee@example.com",
    );
    assert.equal(
      moderationByline({ status: "APPROVED", moderatedAt: at, moderator: null, currentAdminId: "u1" }),
      "Approved",
    );
    assert.equal(
      moderationByline({ status: "PENDING", moderatedAt: null, moderator: null, currentAdminId: "u1" }),
      null,
    );
  });
});

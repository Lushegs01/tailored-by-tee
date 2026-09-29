"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  MAX_BULK_REVIEWS,
  REVIEWS_PATH,
  REVIEW_STATUSES,
  changesWhatCustomersSee,
  deletionMessage,
  moderationMessage,
  type DeletionOutcome,
  type ModerationOutcome,
  type ReviewStatusValue,
} from "@/components/admin/reviews/review-rules";
import { parseInput, withAdmin, type AdminActionResult } from "@/lib/admin/auth";
import { refreshAdminView } from "@/lib/admin/refresh";
import {
  deleteReviewsById,
  isMissingSchemaError,
  setReviewStatus,
  type ChangedReview,
} from "@/lib/admin/reviews";
import { zId, zOneOf } from "@/lib/admin/validation";

/*
 * Review moderation from /admin/reviews. Each action: admin check and rate limit
 * (withAdmin), input re-validated with zod, then one transaction in
 * lib/admin/reviews whose writes are conditional on the status the admin saw and
 * which records the acting admin in the audit trail. Afterwards the reviews page
 * and the navigation's "waiting for approval" count re-render.
 *
 * Nothing the browser sends is trusted beyond "these ids, as I saw them": the
 * database decides what actually changes, and the message says so.
 */

const MODERATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
const DELETE_LIMIT = { limit: 30, windowMs: 60_000 } as const;

const MISSING = "Something is missing. Refresh the page and try again.";

const NEEDS_MIGRATION =
  "Reviews can’t be changed until the latest database changes are applied. Ask your developer to run npm run db:deploy, then try again.";

const reviewRefs = z
  .array(
    z.object({
      id: zId(MISSING),
      status: zOneOf(REVIEW_STATUSES, MISSING),
    }),
    { error: MISSING },
  )
  .min(1, "Choose at least one review.")
  .max(MAX_BULK_REVIEWS, `Choose no more than ${MAX_BULK_REVIEWS} reviews at a time.`);

const moderateSchema = z.object({
  reviews: reviewRefs,
  to: zOneOf(REVIEW_STATUSES, "Choose what should happen to the reviews."),
});

const deleteSchema = z.object({ reviews: reviewRefs });

/**
 * After a moderation step: the reviews page and nav count, and — when a review
 * went on or off display — its product page, so it's current once product pages
 * show approved reviews (Phase 10). The storefront's cached catalogue holds no
 * reviews, so it isn't expired here.
 */
function refreshAfter(changes: readonly ChangedReview[], to: ReviewStatusValue | null): void {
  revalidatePath(REVIEWS_PATH);
  const slugs = new Set(
    changes
      .filter((review) => review.productSlug && changesWhatCustomersSee(review.from, to))
      .map((review) => review.productSlug),
  );
  for (const slug of slugs) revalidatePath(`/product/${slug}`);
  refreshAdminView();
}

/**
 * Approve, reject or return reviews to "waiting for approval" — one or many.
 * Input: { reviews: { id, status }[] (each as the admin saw it), to }. Reviews
 * already in `to` are left alone; reviews someone else changed meanwhile too.
 */
export async function moderateReviews(input: unknown): Promise<AdminActionResult<ModerationOutcome>> {
  return withAdmin<ModerationOutcome>(
    "review.moderate",
    async (admin) => {
      const parsed = parseInput(moderateSchema, input);
      if (!parsed.ok) return parsed;
      const { reviews, to } = parsed.data;

      let result;
      try {
        result = await setReviewStatus({ reviews, to, actorId: admin.id });
      } catch (error) {
        if (isMissingSchemaError(error)) return { ok: false, message: NEEDS_MIGRATION };
        throw error;
      }

      const { ok, message } = moderationMessage({
        to,
        changedLabels: result.changed.map((review) => review.label),
        unchanged: result.unchanged,
        stale: result.stale,
      });

      // Refresh even when nothing changed, so a stale list catches up.
      refreshAfter(result.changed, to);
      if (!ok) return { ok: false, message };

      return {
        ok: true,
        message,
        data: {
          to,
          changed: result.changed.map((review) => ({ id: review.id, from: review.from })),
          unchanged: result.unchanged,
          stale: result.stale,
        },
      };
    },
    MODERATE_LIMIT,
  );
}

/**
 * Permanently deletes reviews — for spam and abuse; a genuine review the owner
 * doesn't want shown should be rejected instead. Input: { reviews: { id, status }[] }.
 */
export async function deleteReviews(input: unknown): Promise<AdminActionResult<DeletionOutcome>> {
  return withAdmin<DeletionOutcome>(
    "review.delete",
    async (admin) => {
      const parsed = parseInput(deleteSchema, input);
      if (!parsed.ok) return parsed;

      let result;
      try {
        result = await deleteReviewsById({ reviews: parsed.data.reviews, actorId: admin.id });
      } catch (error) {
        if (isMissingSchemaError(error)) return { ok: false, message: NEEDS_MIGRATION };
        throw error;
      }

      const { ok, message } = deletionMessage({
        deletedLabels: result.deleted.map((review) => review.label),
        stale: result.stale,
      });

      refreshAfter(result.deleted, null);
      if (!ok) return { ok: false, message };

      return {
        ok: true,
        message,
        data: { deleted: result.deleted.map((review) => review.id), stale: result.stale },
      };
    },
    DELETE_LIMIT,
  );
}

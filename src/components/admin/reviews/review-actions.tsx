"use client";

import { startTransition as startGlobalTransition, useState, useTransition } from "react";

import { deleteReviews, moderateReviews } from "@/app/admin/reviews/actions";
import { ConfirmDialog } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import type { AdminActionResult } from "@/lib/admin/auth";
import { cn } from "@/lib/utils";

import { useReviewModeration, type FeedbackMessage, type ReviewItem } from "./review-moderation-provider";
import { MODERATION_STEPS, type ModerationOutcome, type ReviewStatusValue } from "./review-rules";

/*
 * One review's moderation buttons. Approve, reject and "return to waiting" act at
 * once (each is reversible, and the confirmation line offers Undo); delete asks
 * first, because it can't be undone.
 */

const FAILED: AdminActionResult<never> = {
  ok: false,
  message: "Something went wrong. Refresh the page to check whether the change was saved, then try again.",
};

/** The steps offered for a review in each status, in button order. */
const STEPS_FOR: Record<ReviewStatusValue, readonly ReviewStatusValue[]> = {
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["REJECTED", "PENDING"],
  REJECTED: ["APPROVED", "PENDING"],
};

async function callModerate(
  review: Pick<ReviewItem, "id" | "status">,
  to: ReviewStatusValue,
): Promise<AdminActionResult<ModerationOutcome>> {
  try {
    return await moderateReviews({ reviews: [{ id: review.id, status: review.status }], to });
  } catch {
    return FAILED;
  }
}

export function ReviewActions({ review }: { review: ReviewItem }) {
  const { announce, restoreFocusNear } = useReviewModeration();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<ReviewStatusValue | null>(null);

  function undo(id: string, current: ReviewStatusValue, previous: ReviewStatusValue) {
    // Runs after this card may have left the page: only the provider's helpers are used.
    startGlobalTransition(async () => {
      const result = await callModerate({ id, status: current }, previous);
      announce(
        result.ok
          ? { text: result.message ?? "Undone.", tone: "success" }
          : { text: result.message, tone: "error" },
      );
      restoreFocusNear(id);
    });
  }

  function run(to: ReviewStatusValue) {
    setRunning(to);
    startTransition(async () => {
      const result = await callModerate(review, to);
      setRunning(null);
      let feedback: FeedbackMessage;
      if (result.ok) {
        const change = result.data.changed.find((item) => item.id === review.id);
        feedback = {
          text: result.message ?? "Saved.",
          tone: "success",
          undo: change ? () => undo(change.id, to, change.from) : undefined,
        };
      } else {
        feedback = { text: result.message, tone: "error" };
      }
      announce(feedback);
      restoreFocusNear(review.id);
    });
  }

  return (
    <div className="relative z-10 flex flex-wrap items-center gap-2" aria-busy={pending || undefined}>
      {STEPS_FOR[review.status].map((to) => {
        const step = MODERATION_STEPS[to];
        const primaryStep = to !== "PENDING";
        return (
          <Button
            key={to}
            type="button"
            variant={primaryStep ? "outline" : "ghost"}
            size="sm"
            className={cn("h-9 px-3", !primaryStep && "px-2")}
            disabled={pending}
            onClick={() => run(to)}
          >
            {running === to ? (
              step.pendingLabel
            ) : (
              <>
                {step.verb}
                <span className="sr-only"> {review.label}</span>
              </>
            )}
          </Button>
        );
      })}
      <DeleteReviewButton review={review} disabled={pending} />
    </div>
  );
}

function DeleteReviewButton({ review, disabled }: { review: ReviewItem; disabled: boolean }) {
  const { announce, restoreFocusNear } = useReviewModeration();

  return (
    <ConfirmDialog
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 px-2 text-danger hover:bg-danger/10"
          disabled={disabled}
        >
          Delete<span className="sr-only"> {review.label}</span>
        </Button>
      }
      disabled={disabled}
      tone="destructive"
      title="Delete this review?"
      description={`${capitalise(review.label)}.`}
      confirmLabel="Delete review"
      pendingLabel="Deleting…"
      action={async () => {
        try {
          return await deleteReviews({ reviews: [{ id: review.id, status: review.status }] });
        } catch {
          return FAILED;
        }
      }}
      onSuccess={(result) => {
        announce({ text: result.message ?? "Review deleted.", tone: "success" });
        restoreFocusNear(review.id);
      }}
    >
      <p>
        It will be removed for good and can’t be brought back. Use this for spam or abuse. To keep a genuine
        review out of the store, reject it instead.
      </p>
    </ConfirmDialog>
  );
}

function capitalise(text: string): string {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

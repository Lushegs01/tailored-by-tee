"use client";

import type { ReactNode } from "react";

import { deleteReviews, moderateReviews } from "@/app/admin/reviews/actions";
import { ConfirmDialog } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useReviewModeration, type ReviewItem } from "./review-moderation-provider";
import { MODERATION_STEPS, type ReviewStatusValue } from "./review-rules";

/*
 * The bar that appears while reviews are ticked: how many, and approve, reject,
 * return to waiting or delete them all at once. It sticks to the bottom of the
 * screen while the list scrolls. Every bulk step asks first, saying exactly what
 * will happen to which reviews; reviews already in the chosen state are left
 * alone.
 */

const FAILED = {
  ok: false,
  message: "Something went wrong. Refresh the page to check whether the change was saved, then try again.",
} as const;

/** Phones: two buttons a row, and a long label may wrap rather than overflow. */
const BULK_BUTTON =
  "h-auto min-h-10 px-3 py-2 whitespace-normal sm:h-10 sm:px-4 sm:py-0 sm:whitespace-nowrap";

function reviews(count: number): string {
  return count === 1 ? "1 review" : `${count} reviews`;
}

function isAre(count: number): string {
  return count === 1 ? "is" : "are";
}

export function ReviewBulkBar() {
  const { selected, clearSelection } = useReviewModeration();
  if (selected.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Selected reviews"
      className="sticky bottom-0 z-20 border-t border-foreground bg-background-raised px-4 py-3 md:px-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="flex min-h-10 items-center justify-between gap-4 sm:justify-start">
          <p className="text-body-sm font-medium tabular-nums">{selected.length} selected</p>
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex min-h-10 items-center text-body-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="link-underline-static pb-0.5">Clear selection</span>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
          <BulkStep to="APPROVED" selected={selected} />
          <BulkStep to="REJECTED" selected={selected} />
          <BulkStep to="PENDING" selected={selected} />
          <BulkDelete selected={selected} />
        </div>
      </div>
    </div>
  );
}

/** What the confirmation says for each step. */
function stepDetails(to: ReviewStatusValue, applicable: readonly ReviewItem[], skipped: number): ReactNode[] {
  const count = applicable.length;
  const published = applicable.filter((item) => item.status === "APPROVED").length;
  const demo = applicable.filter((item) => item.isDemo).length;
  const lines: ReactNode[] = [];

  if (to === "APPROVED") {
    lines.push(
      `${count === 1 ? "It" : "They"} will be published. Approved reviews are the only ones customers can see.`,
    );
    if (demo > 0) {
      lines.push(
        `${demo === count ? (count === 1 ? "It is" : "They are all") : `${demo} of them ${isAre(demo)}`} demo content, which is never shown as a genuine review in the live store.`,
      );
    }
  } else if (to === "REJECTED") {
    lines.push(
      `${count === 1 ? "It" : "They"} won’t be shown in the store. You can approve ${count === 1 ? "it" : "them"} later if you change your mind.`,
    );
    if (published > 0) {
      lines.push(
        `${published === count ? (count === 1 ? "It is" : "They are all") : `${published} ${isAre(published)}`} published now and will be taken down.`,
      );
    }
  } else {
    lines.push(
      `${count === 1 ? "It goes" : "They go"} back to waiting for approval, and won’t be shown in the store until someone approves ${count === 1 ? "it" : "them"}.`,
    );
    if (published > 0) {
      lines.push(
        `${published === count ? (count === 1 ? "It is" : "They are all") : `${published} ${isAre(published)}`} published now and will be taken down.`,
      );
    }
  }

  if (skipped > 0) {
    lines.push(
      `${skipped} of the selected ${skipped === 1 ? "review is" : "reviews are"} ${MODERATION_STEPS[to].already} and will be left as ${skipped === 1 ? "it is" : "they are"}.`,
    );
  }
  return lines;
}

function BulkStep({ to, selected }: { to: ReviewStatusValue; selected: readonly ReviewItem[] }) {
  const { clearSelection, announce, restoreFocusToList } = useReviewModeration();
  const step = MODERATION_STEPS[to];
  const applicable = selected.filter((item) => item.status !== to);
  const skipped = selected.length - applicable.length;
  const disabled = applicable.length === 0;
  const primary = to === "APPROVED";

  const verbPhrase =
    to === "PENDING"
      ? `Return ${reviews(applicable.length)} to waiting`
      : `${step.verb} ${reviews(applicable.length)}`;

  return (
    <ConfirmDialog
      trigger={
        <Button
          type="button"
          variant={primary ? "primary" : "outline"}
          size="sm"
          className={BULK_BUTTON}
          disabled={disabled}
          title={disabled ? `The selected reviews are ${step.already}.` : undefined}
        >
          {step.verb}
          <span className="sr-only"> the selected reviews</span>
        </Button>
      }
      disabled={disabled}
      title={`${verbPhrase}?`}
      confirmLabel={verbPhrase}
      pendingLabel={step.pendingLabel}
      action={async () => {
        try {
          return await moderateReviews({
            reviews: applicable.map((item) => ({ id: item.id, status: item.status })),
            to,
          });
        } catch {
          return FAILED;
        }
      }}
      onSuccess={(result) => {
        clearSelection();
        announce({ text: result.message ?? "Saved.", tone: "success" });
        restoreFocusToList();
      }}
    >
      {stepDetails(to, applicable, skipped).map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </ConfirmDialog>
  );
}

function BulkDelete({ selected }: { selected: readonly ReviewItem[] }) {
  const { clearSelection, announce, restoreFocusToList } = useReviewModeration();
  const count = selected.length;
  const published = selected.filter((item) => item.status === "APPROVED").length;

  return (
    <ConfirmDialog
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(BULK_BUTTON, "text-danger hover:bg-danger/10")}
        >
          Delete<span className="sr-only"> the selected reviews</span>
        </Button>
      }
      tone="destructive"
      title={`Delete ${reviews(count)}?`}
      confirmLabel={`Delete ${reviews(count)}`}
      pendingLabel="Deleting…"
      action={async () => {
        try {
          return await deleteReviews({
            reviews: selected.map((item) => ({ id: item.id, status: item.status })),
          });
        } catch {
          return FAILED;
        }
      }}
      onSuccess={(result) => {
        clearSelection();
        announce({ text: result.message ?? "Deleted.", tone: "success" });
        restoreFocusToList();
      }}
    >
      <p>
        {count === 1 ? "It" : "They"} will be removed for good and can’t be brought back. Use this for spam or
        abuse. To keep genuine reviews out of the store, reject them instead.
      </p>
      {published > 0 ? (
        <p>
          {published === count
            ? count === 1
              ? "It is"
              : "They are all"
            : `${published} ${isAre(published)}`}{" "}
          published now.
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

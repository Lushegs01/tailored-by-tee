"use client";

import { bulkChangeProductStatus } from "@/app/admin/products/actions";
import { ConfirmDialog } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { BULK_ACTION_COPY, BULK_ACTION_STATUS, type BulkProductAction } from "@/lib/admin/product-schema";

import { useProductSelection, type ProductItem } from "./product-selection";

/*
 * The bar that appears while products are ticked: how many, and the three steps
 * that can be taken on all of them at once. It sticks to the bottom of the screen
 * while the list scrolls.
 *
 * Every step asks first and says exactly what will happen, including which
 * products will be left alone. Products already in the chosen state are never
 * counted, and publishing is refused on the server for anything not ready —
 * what the browser thinks is only used to word the question.
 */

const FAILED = {
  ok: false,
  message: "Something went wrong. Refresh the page to check whether the change was saved, then try again.",
} as const;

/** Phones: two buttons a row, and a long label may wrap rather than overflow. */
const BULK_BUTTON = "h-auto min-h-10 px-3 py-2 whitespace-normal sm:h-10 sm:px-4 sm:py-0 sm:whitespace-nowrap";

function products(count: number): string {
  return count === 1 ? "1 product" : `${count} products`;
}

export function ProductBulkBar() {
  const { selected, clearSelection } = useProductSelection();
  if (selected.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Selected products"
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
          <BulkStep action="publish" selected={selected} />
          <BulkStep action="unpublish" selected={selected} />
          <BulkStep action="archive" selected={selected} />
        </div>
      </div>
    </div>
  );
}

function BulkStep({ action, selected }: { action: BulkProductAction; selected: readonly ProductItem[] }) {
  const { clearSelection, announce } = useProductSelection();
  const copy = BULK_ACTION_COPY[action];
  const target = BULK_ACTION_STATUS[action];

  const applicable = selected.filter((item) => item.status !== target);
  const already = selected.length - applicable.length;
  const notReady = action === "publish" ? applicable.filter((item) => !item.readyToPublish) : [];
  const disabled = applicable.length === 0;

  const verbPhrase = `${copy.verb} ${products(applicable.length)}`;

  return (
    <ConfirmDialog
      trigger={
        <Button
          type="button"
          variant={action === "publish" ? "primary" : "outline"}
          size="sm"
          className={BULK_BUTTON}
          disabled={disabled}
          title={disabled ? "The selected products are already like that." : undefined}
        >
          {copy.verb}
          <span className="sr-only"> the selected products</span>
        </Button>
      }
      disabled={disabled}
      tone={action === "archive" ? "destructive" : "default"}
      title={`${verbPhrase}?`}
      confirmLabel={verbPhrase}
      pendingLabel="Saving…"
      action={async () => {
        try {
          return await bulkChangeProductStatus({ action, ids: applicable.map((item) => item.id) });
        } catch {
          return FAILED;
        }
      }}
      onSuccess={(result) => {
        clearSelection();
        announce(result.message ?? "Saved.");
      }}
    >
      <p>{copy.description}</p>
      {notReady.length > 0 ? (
        <p>
          {notReady.length === applicable.length
            ? applicable.length === 1
              ? "It isn’t ready to publish"
              : "None of them is ready to publish"
            : `${notReady.length} of them ${notReady.length === 1 ? "isn’t" : "aren’t"} ready to publish`}{" "}
          — a piece needs a price, a main photo and at least one colour and size on sale. Anything not ready is
          left as a draft and named afterwards.
        </p>
      ) : null}
      {already > 0 ? (
        <p>
          {already} of the selected {already === 1 ? "product is" : "products are"} already like that and will be
          left alone.
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

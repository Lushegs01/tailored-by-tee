"use client";

import { useRef, useState } from "react";

import { changeProductStatus } from "@/app/admin/products/actions";
import { Notice } from "@/components/admin/collections/notice";
import { AdminSection, ConfirmDialog, StatusBadge } from "@/components/admin/ui";
import { CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { ProductStatus } from "@/generated/prisma/enums";
import type { ChecklistItem } from "@/lib/admin/product-schema";
import { productStatusDisplay } from "@/lib/admin/status";
import { cn } from "@/lib/utils";

import { ARCHIVE_EXPLANATION, PUBLISH_CHECKLIST_INTRO, STATUS_INTRO } from "./product-copy";

/*
 * "Status": whether customers can see this piece, and what the shop still needs
 * before they can.
 *
 * The checklist is worked out on the server from the product itself, and the
 * server checks it again before publishing — the buttons here only explain. Each
 * step asks first, stays open while it saves, and shows a refusal inside the
 * dialog. Publishing is the page's one filled button.
 */

const FAILED = {
  ok: false,
  message: "Something went wrong. Refresh the page to check whether the change was saved, then try again.",
} as const;

/** Where in the editor each missing item is fixed. */
const CHECKLIST_ANCHORS: Record<ChecklistItem["key"], { href: string; label: string }> = {
  price: { href: "#pricing", label: "Go to Pricing" },
  copy: { href: "#basics", label: "Go to Basics" },
  variants: { href: "#variants", label: "Go to Variants and stock" },
  image: { href: "#photos", label: "Go to Photos" },
  stock: { href: "#variants", label: "Go to Variants and stock" },
};

export interface ProductStatusSectionProps {
  id: string;
  name: string;
  status: ProductStatus;
  checklist: readonly ChecklistItem[];
  /** Every required item passes right now. */
  ready: boolean;
}

export function ProductStatusSection({ id, name, status, checklist, ready }: ProductStatusSectionProps) {
  const display = productStatusDisplay(status);
  const [message, setMessage] = useState<{ text: string; key: number } | null>(null);
  const announced = useRef(0);

  function announce(text: string) {
    announced.current += 1;
    setMessage({ text, key: announced.current });
  }

  const blockers = checklist.filter((item) => item.required && !item.done);

  return (
    <AdminSection
      id="status"
      className="scroll-mt-20 lg:scroll-mt-8"
      title="Status"
      description={STATUS_INTRO}
      actions={<StatusBadge tone={display.tone}>{display.label}</StatusBadge>}
    >
      <p className="text-body-sm text-muted-foreground">{display.description}</p>

      <div className="mt-5 border-t pt-5">
        <h3 className="text-label">Before it goes live</h3>
        <p className="mt-1.5 text-caption text-muted-foreground">{PUBLISH_CHECKLIST_INTRO}</p>

        <ul className="mt-4 divide-y border-y">
          {checklist.map((item) => (
            <li key={item.key} className="flex items-start gap-3 py-3">
              <Mark done={item.done} required={item.required} />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-medium">
                  {item.label}
                  {item.required ? null : <span className="font-normal text-muted-foreground"> — optional</span>}
                </p>
                <p className="mt-0.5 text-caption text-muted-foreground">{item.detail}</p>
                {item.done ? null : (
                  <a
                    href={CHECKLIST_ANCHORS[item.key].href}
                    className="mt-1 inline-flex min-h-8 items-center text-caption text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="link-underline-static pb-0.5">{CHECKLIST_ANCHORS[item.key].label}</span>
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Always present, so every new confirmation is read out. */}
      <div role="status" aria-live="polite">
        {message ? <Notice key={message.key} tone="success" title={message.text} className="mt-5" /> : null}
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:flex-wrap sm:items-center">
        {status === "ACTIVE" ? null : (
          <ConfirmDialog
            trigger={
              <Button
                type="button"
                size="sm"
                disabled={!ready}
                title={ready ? undefined : "Finish the required items above first."}
              >
                Publish
              </Button>
            }
            disabled={!ready}
            title={`Publish “${name}”?`}
            confirmLabel="Publish"
            pendingLabel="Publishing…"
            action={() => run({ id, expectedStatus: status, status: "ACTIVE" })}
            onSuccess={(result) => announce(result.message ?? "Published.")}
          >
            <p>It appears in the shop straight away — on its own page, in listings and in search.</p>
            <p>You can move it back to draft at any time.</p>
          </ConfirmDialog>
        )}

        {status === "ACTIVE" ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" size="sm">
                Move to draft
              </Button>
            }
            tone="destructive"
            title={`Move “${name}” to draft?`}
            confirmLabel="Move to draft"
            action={() => run({ id, expectedStatus: status, status: "DRAFT" })}
            onSuccess={(result) => announce(result.message ?? "Moved to draft.")}
          >
            <p>
              It leaves the shop at once. Its page stops working, and any link to it — shared, bookmarked or in
              search results — will show “page not found”.
            </p>
            <p>Past orders are untouched. Publish it again whenever you like.</p>
          </ConfirmDialog>
        ) : null}

        {status === "ARCHIVED" ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" size="sm">
                Restore to draft
              </Button>
            }
            title={`Restore “${name}” to draft?`}
            confirmLabel="Restore to draft"
            action={() => run({ id, expectedStatus: status, status: "DRAFT" })}
            onSuccess={(result) => announce(result.message ?? "Restored to draft.")}
          >
            <p>
              It comes back into the day-to-day lists so you can work on it. It stays hidden from the shop until you
              publish it.
            </p>
          </ConfirmDialog>
        ) : (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" size="sm">
                Archive
              </Button>
            }
            tone="destructive"
            title={`Archive “${name}”?`}
            confirmLabel="Archive"
            pendingLabel="Archiving…"
            action={() => run({ id, expectedStatus: status, status: "ARCHIVED" })}
            onSuccess={(result) => announce(result.message ?? "Archived.")}
          >
            <p>{ARCHIVE_EXPLANATION}</p>
          </ConfirmDialog>
        )}

        {!ready && status !== "ACTIVE" ? (
          <p className="text-caption text-muted-foreground sm:ml-1">
            {blockers.length === 1
              ? "One required item is still missing above."
              : `${blockers.length} required items are still missing above.`}
          </p>
        ) : null}
      </div>
    </AdminSection>
  );
}

async function run(input: { id: string; expectedStatus: ProductStatus; status: ProductStatus }) {
  try {
    return await changeProductStatus(input);
  } catch {
    return FAILED;
  }
}

/** A tick when an item is done; a hairline ring when it isn't, red for a required one. */
function Mark({ done, required }: { done: boolean; required: boolean }) {
  if (done) {
    return (
      <span className="mt-0.5 shrink-0 text-base text-success">
        <CheckIcon aria-hidden="true" />
        <span className="sr-only">Done: </span>
      </span>
    );
  }
  return (
    <span className={cn("mt-1 size-4 shrink-0 border", required ? "border-danger" : "border-border-strong")}>
      <span className="sr-only">{required ? "Still needed: " : "Not done: "}</span>
    </span>
  );
}

import { useId } from "react";

import type { DiscountPreview } from "@/lib/admin/discount-schema";
import { cn } from "@/lib/utils";

/*
 * The form's summary panel: the code as checkout will read it, the rule in one
 * line and then point by point, and anything worth a second look. Not a live
 * region — it changes with every keystroke, which would be noisy to hear — but
 * a labelled landmark the owner can move to before saving.
 */
export function DiscountPreviewPanel({
  preview,
  mode,
  className,
}: {
  preview: DiscountPreview;
  mode: "create" | "edit";
  className?: string;
}) {
  const headingId = useId();

  return (
    <aside aria-labelledby={headingId} className={cn("min-w-0 border bg-background-raised", className)}>
      <div className="border-b px-4 py-3">
        <h2 id={headingId} className="text-label">
          Summary
        </h2>
        <p className="mt-1 text-caption text-muted-foreground">
          {mode === "create" ? "What customers will get, as you type." : "What customers will get once saved."}
        </p>
      </div>

      <div className="space-y-4 p-4">
        <p className="text-caption text-muted-foreground">
          Code{" "}
          {preview.code ? (
            <span className="border px-1.5 py-0.5 font-medium tracking-wide text-foreground break-all">{preview.code}</span>
          ) : (
            <span>not chosen yet</span>
          )}
        </p>

        {preview.summary ? (
          <>
            <p className="text-body font-medium text-balance">{preview.summary}</p>
            <ul className="space-y-2 text-body-sm text-muted-foreground">
              {preview.details.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 size-1 shrink-0 bg-current" />
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-body-sm text-muted-foreground">
            Choose the type of discount and how much it takes off to see what customers will get.
          </p>
        )}

        {preview.warnings.length > 0 ? (
          <div className="border-t pt-4">
            <p className="text-eyebrow text-accent-brand">Worth a second look</p>
            <ul className="mt-2 space-y-2 text-body-sm">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

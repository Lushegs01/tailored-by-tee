import type { ReactNode } from "react";

import { CheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

import type { ShopReference } from "./shop-references";

/*
 * Plain framed notes for the collection and category pages: a warning before a
 * change that affects the shop, a confirmation after one. Hairline frame, no
 * fill beyond a faint tint, the word carries the meaning (never colour alone).
 * No hooks, so server and client components can both render them.
 */

export type NoticeTone = "info" | "warning" | "success" | "critical";

const TONES: Record<NoticeTone, string> = {
  info: "border-border-strong",
  warning: "border-accent-brand/60 bg-accent-brand/5",
  success: "border-success/50",
  critical: "border-danger/60 bg-danger/5",
};

const TITLE_TONES: Record<NoticeTone, string> = {
  info: "text-foreground",
  warning: "text-accent-brand",
  success: "text-success",
  critical: "text-danger",
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  /** "status" for a confirmation that should be read out when it appears. */
  role?: "status" | "note";
  id?: string;
  className?: string;
}

export function Notice({ tone = "info", title, children, role = "note", id, className }: NoticeProps) {
  return (
    <div id={id} role={role} className={cn("border px-4 py-3 text-body-sm", TONES[tone], className)}>
      {title ? (
        <p className={cn("flex items-start gap-2 font-medium", TITLE_TONES[tone])}>
          {tone === "success" ? <CheckIcon aria-hidden="true" className="mt-0.5 shrink-0 text-base" /> : null}
          <span>{title}</span>
        </p>
      ) : null}
      {children ? (
        <div className={cn("text-foreground [&_p+p]:mt-2", title && "mt-1.5")}>{children}</div>
      ) : null}
    </div>
  );
}

/** The places in the shop's fixed content that point here, as a short list. */
export function ShopReferenceList({ references, className }: { references: readonly ShopReference[]; className?: string }) {
  if (references.length === 0) return null;
  return (
    <ul className={cn("mt-2 list-disc space-y-1 pl-5 text-body-sm", className)}>
      {references.map((reference, index) => (
        <li key={`${reference.place}-${reference.item}-${index}`}>
          <span className="font-medium">{reference.place}</span>
          <span className="text-muted-foreground"> — {reference.item}</span>
        </li>
      ))}
    </ul>
  );
}

/** What happens to those places, in one sentence. */
export function referenceConsequence(references: readonly ShopReference[]): string {
  const links = references.some((reference) => reference.effect === "link");
  const features = references.some((reference) => reference.effect === "feature");
  const parts = [
    links ? "links there would lead to “page not found”" : null,
    features ? "homepage sections showing it would leave it out" : null,
  ].filter(Boolean);
  return `These are set in the site’s code, not here: ${parts.join(", and ")} until your developer updates them.`;
}

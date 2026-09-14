"use client";

import * as React from "react";

import { Dialog } from "@/components/ui/dialog";
import { TextLink } from "@/components/ui/text-link";
import type { SizeGuide } from "@/config/size-guides";

import { SizeGuideTable } from "./size-guide-table";

/** "Size guide" link beside the size picker, opening the chart in a dialog. */
export function SizeGuideDialog({ guide }: { guide: SizeGuide }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center text-caption"
      >
        <span className="link-underline-static pb-0.5">Size guide</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={`Size guide — ${guide.title}`} description={guide.intro} size="lg">
        <SizeGuideTable guide={guide} />
        <TextLink href="/size-guide" onClick={() => setOpen(false)} className="mt-8">
          Every size guide
        </TextLink>
      </Dialog>
    </>
  );
}

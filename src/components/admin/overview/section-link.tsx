import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A quiet text link beside a section's title: "All orders", "Inventory". */
export function SectionLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn("inline-flex min-h-10 items-center text-body-sm text-foreground", className)}>
      <span className="link-underline-static pb-0.5">{children}</span>
    </Link>
  );
}

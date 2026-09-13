import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * Typeset wordmark: tracked grotesk caps + italic serif. Sized in em, so set
 * font-size on the component (e.g. className="text-[15px]") to scale the lockup.
 * Replace with an SVG logo here when final brand assets exist.
 */
export function Wordmark({ className }: { className?: string }) {
  const { primary, secondary } = siteConfig.wordmark;

  return (
    <span className={cn("inline-flex items-baseline gap-[0.5em] whitespace-nowrap leading-none", className)}>
      <span className="mr-[-0.3em] font-sans text-[1em] font-medium uppercase tracking-wordmark">{primary}</span>
      <span className="font-display text-[1.36em] italic">{secondary}</span>
    </span>
  );
}

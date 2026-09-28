import { cn } from "@/lib/utils";

/**
 * Stands in for one overview section whose figures couldn't be read, so the rest
 * of the page still works. The reason comes from lib/admin/metrics' Loaded.
 */
export function SectionUnavailable({
  reason,
  what,
  className,
}: {
  reason: "not_configured" | "failed";
  /** What didn't load, as the start of a sentence: "Sales figures". */
  what: string;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-8 text-center md:px-5", className)}>
      <p className="text-body-sm font-medium">{what} aren’t available right now</p>
      <p className="mx-auto mt-1 max-w-md text-body-sm text-muted-foreground">
        {reason === "not_configured"
          ? "The shop’s database isn’t connected yet, so there’s nothing to show."
          : "They couldn’t be loaded just now. Refresh the page to try again — nothing has changed in the shop."}
      </p>
    </div>
  );
}

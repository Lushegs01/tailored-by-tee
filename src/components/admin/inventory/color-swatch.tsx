import { cn } from "@/lib/utils";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * A small square of the colour, beside its name (the name always carries the
 * meaning; the swatch is decoration). An unreadable hex shows as an empty frame.
 */
export function ColorSwatch({ hex, className }: { hex: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-3 shrink-0 border border-border-strong", className)}
      style={HEX.test(hex) ? { backgroundColor: hex } : undefined}
    />
  );
}

import type { ColorOption } from "@/lib/catalog/types";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export interface ColorSwatchesProps {
  colors: ColorOption[];
  /** Swatches shown before the rest collapse into "+n". */
  max?: number;
  className?: string;
}

function Swatch({ hex }: { hex: string }) {
  // Inner hairline so ivory, white and paper-toned cloth still read as a dot.
  return (
    <span
      className="block size-2.5 shrink-0 rounded-full ring-1 ring-foreground/15 ring-inset"
      style={{ backgroundColor: hex }}
    />
  );
}

/**
 * Colour availability, kept calm: 10px swatches (or the colour name when there is
 * only one). Screen readers get the names rather than the dots. Falls back to a
 * count when a colour has no usable hex.
 */
export function ColorSwatches({ colors, max = 4, className }: ColorSwatchesProps) {
  if (colors.length === 0) return null;

  const row = cn("flex h-[1.125rem] items-center text-caption text-muted-foreground", className);
  const renderable = colors.every((color) => HEX.test(color.hex));

  if (colors.length === 1) {
    const [color] = colors;
    return (
      <p className={cn(row, "gap-2")}>
        {renderable ? <Swatch hex={color.hex} /> : null}
        <span className="sr-only">Colour: </span>
        {color.name}
      </p>
    );
  }

  const names = `Available in: ${colors.map((color) => color.name).join(", ")}`;

  if (!renderable) {
    return (
      <p className={row}>
        <span aria-hidden="true">{pluralize(colors.length, "colour")}</span>
        <span className="sr-only">{names}</span>
      </p>
    );
  }

  const shown = colors.slice(0, max);
  const hidden = colors.length - shown.length;

  return (
    <div className={row}>
      <p className="sr-only">{names}</p>
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {shown.map((color) => (
          <Swatch key={color.id} hex={color.hex} />
        ))}
        {hidden > 0 ? <span className="ml-0.5 text-micro tabular-nums">+{hidden}</span> : null}
      </span>
    </div>
  );
}

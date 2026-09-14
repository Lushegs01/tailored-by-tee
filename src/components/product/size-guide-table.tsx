"use client";

import * as React from "react";

import { formatMeasurement, type SizeGuide } from "@/config/size-guides";
import { cn } from "@/lib/utils";

type Unit = "cm" | "in";

const UNIT_NAMES: Record<Unit, string> = { cm: "centimetres", in: "inches" };

/** A measurement chart with a centimetres/inches switch and "how to measure" notes. */
export function SizeGuideTable({ guide, className }: { guide: SizeGuide; className?: string }) {
  const [unit, setUnit] = React.useState<Unit>("cm");
  const groupName = React.useId();

  return (
    <div className={className}>
      <fieldset className="flex items-center gap-4">
        <legend className="sr-only">Units</legend>
        {(["cm", "in"] as const).map((option) => (
          <label key={option} className="inline-flex min-h-11 cursor-pointer items-center text-label">
            <input
              type="radio"
              name={groupName}
              value={option}
              checked={unit === option}
              onChange={() => setUnit(option)}
              className="peer sr-only"
            />
            <span className="border-b border-transparent pb-1 text-muted-foreground transition-colors peer-checked:border-foreground peer-checked:text-foreground peer-focus-visible:outline-[1.5px] peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring peer-focus-visible:outline-solid">
              {option === "cm" ? "Centimetres" : "Inches"}
            </span>
          </label>
        ))}
      </fieldset>

      {/* `relative` keeps the scroller the containing block for the sr-only caption. */}
      <div className="relative mt-4 overflow-x-auto">
        <table className="w-full min-w-[26rem] border-collapse text-left text-body-sm tabular-nums">
          <caption className="sr-only">
            {guide.title} measurements in {UNIT_NAMES[unit]}
          </caption>
          <thead>
            <tr className="border-b border-border-strong">
              <th scope="col" className="py-3 pr-4 text-label font-medium">
                Size
              </th>
              {guide.columns.map((column) => (
                <th key={column} scope="col" className="py-3 pr-4 text-label font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guide.rows.map((row) => (
              <tr key={row.size} className="border-b">
                <th scope="row" className="py-3 pr-4 font-medium">
                  {row.size}
                </th>
                {row.values.map((value, index) => (
                  <td key={index} className="py-3 pr-4 text-muted-foreground">
                    {formatMeasurement(value, unit)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-8 text-eyebrow text-muted-foreground">How to measure</h3>
      <dl className={cn("mt-4 grid gap-5", guide.howToMeasure.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {guide.howToMeasure.map((item) => (
          <div key={item.label}>
            <dt className="text-body-sm font-medium">{item.label}</dt>
            <dd className="mt-1 text-body-sm text-muted-foreground">{item.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

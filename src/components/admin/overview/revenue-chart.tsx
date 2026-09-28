"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "@/lib/utils";

/*
 * Revenue per Lagos day (or per hour, for today) as plain SVG columns.
 *
 * Everything is worked out on the server and arrives formatted, so this file
 * only draws and responds. The columns are drawn in a 0–100 box stretched to the
 * frame (preserveAspectRatio="none"), which keeps the drawing crisp at any width
 * without measuring; the words (axis labels, the readout) are HTML, so they never
 * stretch. Pointing at or tapping a column — or focusing the chart and using the
 * arrow keys — shows that day's figures in the readout above it. Screen readers
 * get the same figures as a table rendered next to the chart (see sales-section).
 */

export interface RevenueChartBar {
  key: string;
  /** "Wed 16 Sep" or "14:00–15:00". */
  label: string;
  /** Kobo. */
  value: number;
  /** "₦45,000". */
  valueText: string;
  /** "3 orders". */
  detailText: string;
}

export interface RevenueChartTick {
  /** Kobo. */
  value: number;
  /** "₦50k". */
  label: string;
}

export interface RevenueChartAxisLabel {
  index: number;
  text: string;
  /** Hidden on phones. */
  minor: boolean;
}

export interface RevenueChartReadout {
  caption: string;
  valueText: string;
  detailText: string;
}

export interface RevenueChartProps {
  /** The chart's name, e.g. "Revenue by day". */
  name: string;
  /** "day" or "hour", for the keyboard hint. */
  unit: "day" | "hour";
  bars: RevenueChartBar[];
  /** Top of the axis, in kobo (the last tick). */
  max: number;
  ticks: RevenueChartTick[];
  axisLabels: RevenueChartAxisLabel[];
  /** What the readout says while nothing is pointed at, e.g. the best day. */
  idle: RevenueChartReadout;
}

/** Share of each column's slot that is ink: fewer, wider slots get relatively thinner columns. */
function columnWidth(count: number): number {
  if (count <= 7) return 0.4;
  if (count <= 31) return 0.62;
  return 0.72;
}

/** A column that sold anything stays visible, however small beside the best day. */
const MIN_VISIBLE_HEIGHT = 0.75;

/** The plot's height; the money axis beside it shares it. */
const PLOT_HEIGHT = "h-44 md:h-56";

export function RevenueChart({ name, unit, bars, max, ticks, axisLabels, idle }: RevenueChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  const count = bars.length;
  const slot = count > 0 ? 100 / count : 100;
  const width = columnWidth(count);
  const scaleMax = max > 0 ? max : 1;
  const clamp = (index: number) => Math.min(count - 1, Math.max(0, index));

  function indexAt(clientX: number): number | null {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || count === 0) return null;
    return clamp(Math.floor(((clientX - rect.left) / rect.width) * count));
  }

  function point(event: PointerEvent<HTMLDivElement>) {
    const index = indexAt(event.clientX);
    if (index !== null) setActive(index);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (count === 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
        next = (active ?? count) - 1;
        break;
      case "ArrowRight":
        next = (active ?? -1) + 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      case "Escape":
        setActive(null);
        return;
      default:
        return;
    }
    event.preventDefault();
    setActive(clamp(next));
  }

  const readout: RevenueChartReadout =
    active !== null && bars[active]
      ? { caption: bars[active].label, valueText: bars[active].valueText, detailText: bars[active].detailText }
      : idle;

  return (
    <div>
      <p aria-live="polite" aria-atomic="true" className="min-h-[3.25rem]">
        <span className="block text-caption text-muted-foreground">{readout.caption}</span>
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
          <span className="text-lead font-medium">{readout.valueText}</span>
          <span className="text-caption text-muted-foreground tabular-nums">{readout.detailText}</span>
        </span>
      </p>

      <div className="mt-4 flex">
        {/* Money axis: exactly as tall as the plot, so each label sits on its gridline. */}
        <div aria-hidden="true" className={cn("relative w-12 shrink-0", PLOT_HEIGHT)}>
          {ticks.map((tick) => (
            <span
              key={tick.value}
              className="absolute right-2 translate-y-1/2 text-micro whitespace-nowrap text-muted-foreground tabular-nums"
              style={{ bottom: `${(tick.value / scaleMax) * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            ref={plotRef}
            role="group"
            aria-label={`${name}. Use the left and right arrow keys to read each ${unit}; the table after the chart lists the same figures.`}
            tabIndex={0}
            onPointerDown={point}
            onPointerMove={point}
            onPointerLeave={(event) => {
              // A finger lifting also "leaves": keep the tapped column showing until the next tap.
              if (event.pointerType === "mouse") setActive(null);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setActive((current) => current ?? count - 1)}
            onBlur={() => setActive(null)}
            className={cn("relative cursor-crosshair touch-pan-y select-none focus-visible:outline-offset-4", PLOT_HEIGHT)}
          >
            {ticks.map((tick) => (
              <div
                key={tick.value}
                aria-hidden="true"
                className={cn("absolute inset-x-0 border-t", tick.value === 0 ? "border-border-strong" : "border-border")}
                style={{ bottom: `${(tick.value / scaleMax) * 100}%` }}
              />
            ))}

            {active !== null ? (
              <div
                aria-hidden="true"
                className="absolute inset-y-0 bg-foreground/[0.06]"
                style={{ left: `${active * slot}%`, width: `${slot}%` }}
              />
            ) : null}

            <svg
              aria-hidden="true"
              focusable="false"
              className="absolute inset-0 size-full"
              viewBox={`0 0 ${Math.max(count, 1)} 100`}
              preserveAspectRatio="none"
              shapeRendering="crispEdges"
            >
              {bars.map((bar, index) => {
                if (bar.value <= 0) return null;
                const height = Math.min(100, Math.max((bar.value / scaleMax) * 100, MIN_VISIBLE_HEIGHT));
                return (
                  <rect
                    key={bar.key}
                    x={index + (1 - width) / 2}
                    y={100 - height}
                    width={width}
                    height={height}
                    className={cn(
                      "transition-[fill] duration-150",
                      active === null
                        ? "fill-foreground/80"
                        : index === active
                          ? "fill-foreground"
                          : "fill-foreground/30",
                    )}
                  />
                );
              })}
            </svg>
          </div>

          {/* Day (or hour) axis. */}
          <div aria-hidden="true" className="relative mt-2 h-4">
            {axisLabels.map((label) => {
              const center = (label.index + 0.5) * slot;
              const edge = center < 10 ? "start" : center > 90 ? "end" : "middle";
              return (
                <span
                  key={label.index}
                  className={cn(
                    "absolute top-0 text-micro whitespace-nowrap text-muted-foreground tabular-nums",
                    edge === "middle" && "-translate-x-1/2",
                    label.minor && "max-sm:hidden",
                  )}
                  style={
                    edge === "start"
                      ? { left: `${label.index * slot}%` }
                      : edge === "end"
                        ? { right: `${(count - 1 - label.index) * slot}%` }
                        : { left: `${center}%` }
                  }
                >
                  {label.text}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

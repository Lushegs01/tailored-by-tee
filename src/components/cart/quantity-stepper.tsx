"use client";

import { MinusIcon, PlusIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface QuantityStepperProps {
  value: number;
  min?: number;
  max: number;
  /** Names the piece, e.g. "Structured Overshirt, Clay, M". */
  label: string;
  onChange: (value: number) => void;
  className?: string;
}

/**
 * Compact − qty + control. The ends use aria-disabled rather than `disabled`, so
 * keyboard focus stays put when a limit is reached instead of dropping to the page.
 */
export function QuantityStepper({ value, min = 1, max, label, onChange, className }: QuantityStepperProps) {
  return (
    <div role="group" aria-label={`Quantity, ${label}`} className={cn("inline-flex items-center border", className)}>
      <StepButton label={`Decrease quantity of ${label}`} disabled={value <= min} onPress={() => onChange(value - 1)}>
        <MinusIcon />
      </StepButton>
      <span className="min-w-6 text-center text-body-sm tabular-nums">
        <span className="sr-only">Quantity </span>
        {value}
      </span>
      <StepButton label={`Increase quantity of ${label}`} disabled={value >= max} onPress={() => onChange(value + 1)}>
        <PlusIcon />
      </StepButton>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onPress();
      }}
      className={cn(
        "inline-flex size-11 items-center justify-center text-[0.9375rem] transition-opacity duration-300 ease-editorial",
        disabled ? "cursor-default opacity-30" : "hover:opacity-60",
      )}
    >
      {children}
    </button>
  );
}

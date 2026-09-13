import { cn } from "@/lib/utils";

/** Slow linen shimmer. Size it to match the real layout so nothing shifts on load. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-shimmer bg-surface bg-[linear-gradient(90deg,transparent_30%,rgb(255_255_255/0.4)_50%,transparent_70%)] bg-size-[200%_100%]",
        className,
      )}
      {...props}
    />
  );
}

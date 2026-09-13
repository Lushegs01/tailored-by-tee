import type { NavLink } from "@/config/site";
import { Emphasis } from "@/components/ui/emphasis";
import { TextLink } from "@/components/ui/text-link";
import { cn } from "@/lib/utils";

export interface SectionHeadingProps {
  eyebrow?: string;
  /** Supports *emphasis*. */
  title: string;
  description?: string;
  action?: NavLink;
  /** "split": title left, description + action right (desktop). "stacked": one column. */
  layout?: "split" | "stacked";
  size?: "sm" | "md";
  as?: "h1" | "h2" | "h3";
  id?: string;
  className?: string;
}

/** Consistent section opener: tracked eyebrow, serif title, quiet supporting line. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  layout = "split",
  size = "md",
  as: Heading = "h2",
  id,
  className,
}: SectionHeadingProps) {
  const split = layout === "split";

  return (
    <div
      className={cn(
        "flex flex-col gap-5",
        split && "md:flex-row md:items-end md:justify-between md:gap-12",
        className,
      )}
    >
      <div className="max-w-2xl">
        {eyebrow ? <p className="mb-4 text-eyebrow text-muted-foreground">{eyebrow}</p> : null}
        <Heading
          id={id}
          className={cn("font-display", size === "md" ? "text-display-md" : "text-display-sm")}
        >
          <Emphasis text={title} />
        </Heading>
      </div>
      {description || action ? (
        <div className={cn("flex flex-col gap-5", split && "md:max-w-sm md:items-end md:text-right")}>
          {description ? <p className="text-body text-muted-foreground">{description}</p> : null}
          {action ? <TextLink href={action.href}>{action.label}</TextLink> : null}
        </div>
      ) : null}
    </div>
  );
}

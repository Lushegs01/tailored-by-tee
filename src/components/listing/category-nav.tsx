import Link from "next/link";

import { cn } from "@/lib/utils";

import type { CategoryNavItem } from "./types";

export interface CategoryNavProps {
  items: CategoryNavItem[];
  /** "rail": a counted list atop the desktop filter column. "row": a swipeable line of names below lg. */
  variant: "rail" | "row";
  className?: string;
}

/** Hover draws the underline; the current page keeps it. */
const underline =
  "link-underline pb-0.5 group-hover/category:bg-size-[100%_1px] group-aria-[current=page]/category:bg-size-[100%_1px]";

/** Moving between categories is navigation, not filtering — so these are plain links. */
export function CategoryNav({ items, variant, className }: CategoryNavProps) {
  if (items.length === 0) return null;

  if (variant === "row") {
    return (
      <nav aria-label="Categories" className={cn("lg:hidden", className)}>
        {/* `relative` keeps the scroller the containing block for anything positioned inside it. */}
        <ul className="relative -mx-(--gutter) flex snap-x gap-x-6 overflow-x-auto scroll-px-(--gutter) px-(--gutter) scrollbar-none">
          {items.map((item) => (
            <li key={item.key} className="shrink-0 snap-start">
              <Link
                href={item.href}
                aria-current={item.current ? "page" : undefined}
                className="group/category inline-flex min-h-11 items-center text-body-sm text-muted-foreground transition-colors duration-300 aria-[current=page]:text-foreground"
              >
                <span className={underline}>{item.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-labelledby="listing-category-nav" className={cn("border-b pb-5", className)}>
      <p id="listing-category-nav" className="mb-2 text-eyebrow text-muted-foreground">
        Category
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className="group/category flex min-h-9 items-baseline justify-between gap-4 text-body-sm aria-[current=page]:font-medium"
            >
              <span className={underline}>{item.name}</span>
              <span className="text-micro font-normal tabular-nums text-muted-foreground">
                {item.count}
                <span className="sr-only"> {item.count === 1 ? "piece" : "pieces"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

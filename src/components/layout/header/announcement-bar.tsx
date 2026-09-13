import Link from "next/link";

import type { SiteConfig } from "@/config/site";

export type Announcement = NonNullable<SiteConfig["announcement"]>;

/**
 * Ink strip above the navigation. When there is a destination the whole line is
 * the link, so on phones — where the link label is dropped for space — the tap
 * target still spans the bar. `theme-ink` flips the focus ring to paper.
 */
export function AnnouncementBar({ message, href, linkLabel }: Announcement) {
  return (
    <div className="theme-ink flex h-(--announcement-height) items-center justify-center bg-ink px-(--gutter) text-paper">
      <p className="line-clamp-2 text-center text-micro font-medium uppercase leading-[1.25] tracking-[0.12em] sm:tracking-label">
        {href ? (
          <Link href={href} className="group/announcement inline-flex items-center gap-4 focus-visible:outline-offset-2">
            <span>{message}</span>
            {linkLabel ? (
              <span className="link-underline-static hidden pb-px group-hover/announcement:bg-size-[0%_1px] sm:inline">
                {linkLabel}
              </span>
            ) : null}
          </Link>
        ) : (
          message
        )}
      </p>
    </div>
  );
}

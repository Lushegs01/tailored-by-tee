import Link from "next/link";

import { ArrowUpRightIcon } from "@/components/icons";
import type { NavLink } from "@/config/site";

/*
 * 44px hit area on touch layouts, tighter rhythm on desktop. The underline sits on
 * the label so it hugs the text, but draws in when any part of the hit area is
 * hovered or focused.
 */
const hitArea = "group/footer-link inline-flex min-h-11 items-center gap-1.5 lg:min-h-8";
const underline =
  "link-underline pb-0.5 group-hover/footer-link:bg-size-[100%_1px] group-focus-visible/footer-link:bg-size-[100%_1px]";

// Joined as plain strings: cn()'s tailwind-merge would drop the custom text sizes.
const tones = {
  default: "text-body-sm text-foreground",
  quiet: "text-caption text-muted-foreground transition-colors duration-300 ease-editorial hover:text-foreground",
} as const;

export interface FooterLinkProps {
  link: NavLink;
  tone?: keyof typeof tones;
}

/** Internal links route client-side; external links open in a new tab and say so. */
export function FooterLink({ link, tone = "default" }: FooterLinkProps) {
  const className = `${hitArea} ${tones[tone]}`;
  const label = <span className={underline}>{link.label}</span>;

  if (/^https?:\/\//.test(link.href)) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
        {label}
        <ArrowUpRightIcon className="text-[0.9em] text-muted-foreground" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }

  if (link.href.startsWith("mailto:") || link.href.startsWith("tel:")) {
    return (
      <a href={link.href} className={className}>
        {label}
      </a>
    );
  }

  return (
    <Link href={link.href} className={className}>
      {label}
    </Link>
  );
}

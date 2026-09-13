import type { NavLink } from "@/config/site";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { FooterLink } from "./footer-link";

function FooterLinkColumn({ title, links }: { title: string; links: NavLink[] }) {
  const headingId = `footer-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <div>
      <h2 id={headingId} className="text-eyebrow text-muted-foreground">
        {title}
      </h2>
      <ul aria-labelledby={headingId} className="mt-3 flex flex-col items-start lg:mt-5">
        {links.map((link) => (
          <li key={link.href}>
            <FooterLink link={link} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Link columns from site config, plus social. Two-up on phones, four-up from md. */
export function FooterNav({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Footer"
      className={cn("grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-4 md:gap-x-8", className)}
    >
      {siteConfig.footer.columns.map((column) => (
        <FooterLinkColumn key={column.title} title={column.title} links={column.links} />
      ))}
      <FooterLinkColumn title="Social" links={siteConfig.social} />
    </nav>
  );
}

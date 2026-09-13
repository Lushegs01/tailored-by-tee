import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { FooterLink } from "./footer-link";

/** Copyright, currency marker and legal links. */
export function FooterBottom({ className }: { className?: string }) {
  const year = new Date().getFullYear();

  return (
    <div
      className={cn(
        "flex flex-col gap-y-3 border-t pt-6 md:flex-row md:items-center md:justify-between md:gap-x-10",
        className,
      )}
    >
      <p className="text-caption text-muted-foreground">
        &copy; {year} {siteConfig.name}. Made in Lagos.
      </p>

      <div className="flex flex-wrap items-center gap-x-8">
        <p className="text-caption tracking-wide text-muted-foreground">
          <span aria-hidden="true">NGN ₦</span>
          <span className="sr-only">Prices are shown in Nigerian naira</span>
        </p>
        <nav aria-label="Legal">
          <ul className="flex items-center gap-x-6">
            {siteConfig.footer.legal.map((link) => (
              <li key={link.href}>
                <FooterLink link={link} tone="quiet" />
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

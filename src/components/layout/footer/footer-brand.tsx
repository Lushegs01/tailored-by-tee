import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { FooterLink } from "./footer-link";

/** Wordmark, tagline and studio details — the footer's quiet signature. */
export function FooterBrand({ className }: { className?: string }) {
  const { email, hours } = siteConfig.contact;

  return (
    <div className={cn("flex flex-col items-start", className)}>
      <Link
        href="/"
        aria-label={`${siteConfig.name}, home`}
        className="-my-2 inline-flex min-h-11 items-center transition-opacity duration-300 ease-editorial hover:opacity-70"
      >
        <Wordmark className="text-[15px]" />
      </Link>

      <p className="mt-6 max-w-[17ch] font-display text-display-xs italic">{siteConfig.tagline}</p>

      <address className="mt-8 flex flex-col items-start text-body-sm not-italic text-muted-foreground lg:mt-10">
        <span>{siteConfig.location}</span>
        <FooterLink link={{ label: email, href: `mailto:${email}` }} />
        <span>{hours}</span>
      </address>
    </div>
  );
}

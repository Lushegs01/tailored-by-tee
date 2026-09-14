import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { ChevronLeftIcon, LockIcon } from "@/components/icons";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/config/site";

/**
 * The header during checkout: a way back, the wordmark, and a quiet "secure"
 * signal. No navigation, search or bag — nothing that competes with finishing.
 */
export function CheckoutHeader({ complete }: { complete: boolean }) {
  const back = complete ? { href: "/shop", label: "Continue shopping", short: "Shop" } : { href: "/cart", label: "Back to bag", short: "Bag" };

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <Container className="grid h-(--header-height) grid-cols-[1fr_auto_1fr] items-center gap-x-4">
        <Link
          href={back.href}
          className="-ml-1 inline-flex min-h-11 items-center gap-2 justify-self-start px-1 text-label transition-opacity duration-300 hover:opacity-60"
        >
          <ChevronLeftIcon aria-hidden="true" className="text-base" />
          <span className="hidden sm:inline">{back.label}</span>
          <span className="sm:hidden">{back.short}</span>
        </Link>

        <Link
          href="/"
          aria-label={siteConfig.name}
          className="inline-flex min-h-11 items-center justify-self-center text-[0.8125rem] md:text-sm"
        >
          <Wordmark />
        </Link>

        <p className="inline-flex items-center gap-2 justify-self-end text-label text-muted-foreground">
          <LockIcon aria-hidden="true" className="text-base" />
          <span className="hidden sm:inline">Secure checkout</span>
          <span className="sr-only sm:hidden">Secure checkout</span>
        </p>
      </Container>
    </header>
  );
}

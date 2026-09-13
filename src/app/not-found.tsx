import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { MediaImage } from "@/components/ui/media-image";
import { TextLink } from "@/components/ui/text-link";
import type { NavLink } from "@/config/site";
import { getMedia } from "@/lib/media";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

const BROWSE_LINKS: NavLink[] = [
  { label: "Shirts", href: "/shop/shirts" },
  { label: "Trousers", href: "/shop/trousers" },
  { label: "Outerwear", href: "/shop/outerwear" },
  { label: "Knitwear", href: "/shop/knitwear" },
];

/** Five of twelve columns inside the capped container; full gutter width on phones. */
const IMAGE_SIZES = "(min-width: 1920px) 720px, (min-width: 768px) 40vw, calc(100vw - 2.5rem)";

function BrowseLinks({ centred }: { centred: boolean }) {
  return (
    <div className="border-t pt-7">
      <h2 className="text-eyebrow text-muted-foreground">Or browse</h2>
      <ul className={cn("mt-2 flex flex-wrap gap-x-8", centred && "justify-center")}>
        {BROWSE_LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="group/browse inline-flex min-h-11 items-center text-body text-foreground">
              <span className="link-underline pb-0.5 group-hover/browse:bg-size-[100%_1px] group-focus-visible/browse:bg-size-[100%_1px]">
                {link.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Editorial 404 inside the site chrome — for unmatched URLs and notFound().
 * Split with a photograph when one exists; a centred typographic page otherwise.
 */
export default function NotFound() {
  const image = getMedia("editorial:notFound");

  return (
    <Container className="py-14 md:py-20 xl:py-28">
      <div className="grid gap-y-14 md:grid-cols-12 md:items-center md:gap-x-8">
        <div
          className={
            image ? "md:col-span-6 md:col-start-7 xl:col-span-5 xl:col-start-7" : "md:col-span-8 md:col-start-3"
          }
        >
          <EmptyState
            as="h1"
            align={image ? "start" : "center"}
            eyebrow="Error 404"
            title="This page has been *taken in.*"
            body="The page you were looking for has moved, sold out, or never existed. Let us help you find your way back."
            actions={
              <>
                <Button asChild arrow>
                  <Link href="/">Return home</Link>
                </Button>
                <TextLink href="/shop/new-arrivals">Shop new arrivals</TextLink>
              </>
            }
          >
            <BrowseLinks centred={!image} />
          </EmptyState>
        </div>

        {image ? (
          <MediaImage
            image={image}
            ratio="4/5"
            sizes={IMAGE_SIZES}
            preload
            className="md:order-first md:col-span-5"
          />
        ) : null}
      </div>
    </Container>
  );
}

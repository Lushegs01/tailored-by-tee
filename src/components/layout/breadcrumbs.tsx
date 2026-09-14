import Link from "next/link";

import { JsonLd, breadcrumbJsonLd, type BreadcrumbItem } from "@/components/seo/json-ld";

export type { BreadcrumbItem } from "@/components/seo/json-ld";

/** Quiet trail above page titles, with matching BreadcrumbList structured data. */
export function Breadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  if (items.length === 0) return null;
  const last = items.length - 1;

  return (
    <>
      <nav aria-label="Breadcrumb" className={className}>
        <ol className="flex flex-wrap items-center gap-x-2.5 text-caption text-muted-foreground">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2.5">
              {index > 0 ? (
                <span aria-hidden="true" className="text-subtle-foreground">
                  /
                </span>
              ) : null}
              {item.href && index < last ? (
                <Link
                  href={item.href}
                  className="inline-flex min-h-8 items-center transition-colors duration-300 hover:text-foreground"
                >
                  <span className="link-underline pb-0.5">{item.label}</span>
                </Link>
              ) : (
                <span aria-current={index === last ? "page" : undefined} className="text-foreground">
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd data={breadcrumbJsonLd(items)} />
    </>
  );
}

import type { ReactNode } from "react";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { Container } from "@/components/ui/container";
import { Emphasis } from "@/components/ui/emphasis";

export interface ListingHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  /** Supports *emphasis*. */
  title: string;
  description?: string;
  eyebrow?: string;
  /** Rendered beneath, e.g. the category row on small screens. */
  children?: ReactNode;
}

/** Page opener for listings: trail, serif title, and a short line of context set to the right. */
export function ListingHeader({ breadcrumbs, title, description, eyebrow, children }: ListingHeaderProps) {
  return (
    <Container className="pt-6 md:pt-8">
      <Breadcrumbs items={breadcrumbs} />
      <div className="mt-10 grid gap-y-5 md:mt-14 md:grid-cols-12 md:items-end md:gap-x-8 xl:mt-16">
        <div className="md:col-span-7">
          {eyebrow ? <p className="mb-4 text-eyebrow text-muted-foreground">{eyebrow}</p> : null}
          <h1 className="font-display text-display-md">
            <Emphasis text={title} />
          </h1>
        </div>
        {description ? (
          <p className="max-w-md text-body text-muted-foreground md:col-span-5 lg:col-span-4 lg:col-start-9">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </Container>
  );
}

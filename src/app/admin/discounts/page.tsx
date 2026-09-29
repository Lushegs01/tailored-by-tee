import Link from "next/link";

import { DiscountFeedbackProvider, DiscountFlash } from "@/components/admin/discounts/discount-feedback";
import { CheckoutIgnoresCodesNotice, NoDatabaseNotice } from "@/components/admin/discounts/discount-notices";
import { DiscountsTable } from "@/components/admin/discounts/discounts-table";
import { AdminEmptyState, AdminPageHeader, ListToolbar, Pagination } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/admin/auth";
import {
  DISCOUNT_LIST_ALLOWED,
  DISCOUNT_STATUS_OPTIONS,
  DISCOUNTS_PATH,
  discountCodeProblem,
  NEW_DISCOUNT_PATH,
} from "@/lib/admin/discount-schema";
import { getDiscountStatusCounts, listDiscounts } from "@/lib/admin/discounts";
import { formatNumber } from "@/lib/admin/format";
import { adminMetadata } from "@/lib/admin/metadata";
import { buildListHref, parseListParams } from "@/lib/admin/pagination";
import { isDatabaseConfigured } from "@/lib/db";
import { cn } from "@/lib/utils";

export const metadata = adminMetadata("Discounts");

const DESCRIPTION =
  "Codes customers enter at checkout, one per order. Checkout checks every rule again when the order is placed.";

/** A code named in ?deleted= after a delete, if it looks like one. */
function deletedCode(value: string | string[] | undefined): string | null {
  const code = Array.isArray(value) ? value[0] : value;
  return code && discountCodeProblem(code) === null ? code : null;
}

/**
 * /admin/discounts: every discount code with its rule in words, status (Lagos
 * time), uses, per-customer limit and dates. Search by code or description,
 * filter by status, sort by code, uses or end date.
 */
export default async function DiscountsPage(props: PageProps<"/admin/discounts">) {
  await requireAdminPage(DISCOUNTS_PATH);

  const newButton = (
    <Button asChild size="sm">
      <Link href={NEW_DISCOUNT_PATH}>New discount</Link>
    </Button>
  );

  if (!isDatabaseConfigured()) {
    return (
      <>
        <AdminPageHeader title="Discounts" description={DESCRIPTION} />
        <NoDatabaseNotice />
      </>
    );
  }

  const searchParams = await props.searchParams;
  const parsed = parseListParams(searchParams, DISCOUNT_LIST_ALLOWED);
  const deleted = deletedCode(searchParams.deleted);
  const now = new Date();
  const [{ rows, total, page }, counts] = await Promise.all([listDiscounts(parsed, now), getDiscountStatusCounts(now)]);
  const params = { ...parsed, page };

  const filtered = params.q !== "" || Object.keys(params.filters).length > 0;
  const hasAny = DISCOUNT_STATUS_OPTIONS.some((option) => counts[option.value] > 0);
  const activeStatus = params.filters.status;

  return (
    <DiscountFeedbackProvider>
      <DiscountFlash message={deleted ? `Discount ${deleted} deleted.` : null} clearParams={["deleted"]} />

      <AdminPageHeader title="Discounts" description={DESCRIPTION} actions={newButton} />

      <CheckoutIgnoresCodesNotice className="mt-6" />

      {hasAny ? (
        <nav aria-label="Discounts by status" className="mt-6">
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-body-sm">
            {DISCOUNT_STATUS_OPTIONS.filter((option) => counts[option.value] > 0).map((option) => {
              const current = activeStatus === option.value;
              return (
                <li key={option.value}>
                  <Link
                    href={buildListHref(DISCOUNTS_PATH, params, { filters: { status: current ? null : option.value } })}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-1.5 transition-colors hover:text-foreground",
                      current ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span className={cn("tabular-nums", current && "font-medium")}>
                      {formatNumber(counts[option.value])}
                    </span>
                    <span className={current ? "link-underline-static pb-0.5" : undefined}>{option.label.toLowerCase()}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      <ListToolbar
        className={hasAny ? "mt-3" : "mt-8"}
        searchLabel="Search discounts by code or description"
        searchPlaceholder="Code or description"
        filters={[{ name: "status", label: "Status", allLabel: "All statuses", options: DISCOUNT_STATUS_OPTIONS }]}
      />

      <div className="mt-4">
        {rows.length > 0 ? (
          <DiscountsTable rows={rows} params={params} now={now} />
        ) : (
          <div className="border bg-background-raised">
            {filtered ? (
              <AdminEmptyState
                as="h2"
                title="Nothing matches"
                body="No discount codes match this search and status. Try another search, or clear the filters."
                action={
                  <Link href={buildListHref(DISCOUNTS_PATH, params, { clear: true })} className="text-body-sm">
                    <span className="link-underline-static pb-0.5">Clear search and filters</span>
                  </Link>
                }
              />
            ) : (
              <AdminEmptyState
                as="h2"
                title="No discount codes yet"
                body="Create a code for a promotion, a giveaway or a thank-you to regular customers. You choose how much it takes off, what it applies to, when it runs and how often it can be used."
                action={
                  <Link href={NEW_DISCOUNT_PATH} className="text-body-sm">
                    <span className="link-underline-static pb-0.5">Create your first discount</span>
                  </Link>
                }
              />
            )}
          </div>
        )}
      </div>

      <Pagination base={DISCOUNTS_PATH} params={params} total={total} noun={{ one: "discount code", other: "discount codes" }} />
    </DiscountFeedbackProvider>
  );
}

import {
  DataTable,
  RowHeader,
  RowLink,
  StatusBadge,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from "@/components/admin/ui";
import {
  describeDiscountRule,
  describePerCustomer,
  describeSchedule,
  describeUses,
  discountPath,
  discountStatusDisplay,
  DISCOUNTS_PATH,
} from "@/lib/admin/discount-schema";
import type { DiscountListRow } from "@/lib/admin/discounts";
import { buildSortHref, sortDirectionFor, type ListParams } from "@/lib/admin/pagination";

/**
 * The discount list: code (opens the code), the rule in words, status, uses,
 * the per-customer limit and dates. Rows stack into blocks on phones.
 */
export function DiscountsTable({ rows, params, now }: { rows: DiscountListRow[]; params: ListParams; now: Date }) {
  const sort = (column: string, firstDir: "asc" | "desc") => ({
    href: buildSortHref(DISCOUNTS_PATH, params, column, firstDir),
    direction: sortDirectionFor(params, column),
  });

  return (
    <DataTable caption="Discount codes">
      <THead>
        <Tr>
          <Th sort={sort("code", "asc")}>Code</Th>
          <Th>Discount</Th>
          <Th>Status</Th>
          <Th sort={sort("uses", "desc")} align="end">
            Uses
          </Th>
          <Th>Per customer</Th>
          <Th sort={sort("ends", "asc")}>
            Dates<span className="sr-only"> (sorts by end date)</span>
          </Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map((row) => {
          const status = discountStatusDisplay(row, now);
          return (
            <Tr key={row.id} interactive>
              <RowHeader className="md:max-w-56">
                <RowLink href={discountPath(row.id)} className="tracking-wide break-all">
                  {row.code}
                </RowLink>
                {row.description ? (
                  <span className="mt-0.5 block text-caption font-normal break-words text-muted-foreground">
                    {row.description}
                  </span>
                ) : null}
              </RowHeader>
              <Td label="Discount" className="md:min-w-56">
                <span className="max-md:text-right">{describeDiscountRule(row)}</span>
              </Td>
              <Td label="Status">
                <span title={status.description}>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </span>
              </Td>
              <Td label="Uses" align="end" className="whitespace-nowrap">
                {describeUses(row.usageCount, row.usageLimit)}
              </Td>
              <Td label="Per customer" className="whitespace-nowrap">
                {describePerCustomer(row.perCustomerLimit)}
              </Td>
              <Td label="Dates" className="text-caption md:min-w-40">
                <span className="max-md:text-right">{describeSchedule(row)}</span>
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </DataTable>
  );
}

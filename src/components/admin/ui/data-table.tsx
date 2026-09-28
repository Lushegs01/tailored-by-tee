import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import type { SortDir } from "@/lib/admin/pagination";
import { cn } from "@/lib/utils";

/*
 * Semantic tables for admin lists.
 *
 *   <DataTable caption="Orders">
 *     <THead>
 *       <Tr>
 *         <Th>Order</Th>
 *         <Th sort={{ href: buildSortHref(base, params, "createdAt", "desc"), direction: sortDirectionFor(params, "createdAt") }}>Placed</Th>
 *         <Th align="end">Total</Th>
 *       </Tr>
 *     </THead>
 *     <TBody>
 *       {orders.map((order) => (
 *         <Tr key={order.id} interactive>
 *           <RowHeader><RowLink href={`/admin/orders/${order.number}`}>{order.number}</RowLink></RowHeader>
 *           <Td label="Placed">{formatAdminDate(order.createdAt)}</Td>
 *           <Td label="Total" align="end">{formatKobo(order.total)}</Td>
 *         </Tr>
 *       ))}
 *     </TBody>
 *   </DataTable>
 *
 * Phones (below md) — choose per table:
 * - layout="stack" (default): each row becomes a block; cells show their `label`
 *   before the value. The row's RowHeader (or a Td with `primary`) becomes the
 *   block's title. Column headers stay available to screen readers.
 * - layout="scroll": the table keeps its columns and scrolls sideways inside its
 *   own frame (for wide, comparison-heavy tables like stock grids).
 *
 * Row links: put one RowLink in the row's first cell and mark the Tr `interactive`;
 * the whole row becomes clickable. Any other control in that row needs
 * className="relative z-10" so it stays clickable above the row link.
 */

export interface DataTableProps extends Omit<ComponentProps<"table">, "children"> {
  /** The table's accessible name, e.g. "Orders". Hidden unless showCaption. */
  caption: string;
  showCaption?: boolean;
  layout?: "stack" | "scroll";
  /** Minimum width in scroll layout (any CSS length). Default 48rem. */
  minWidth?: string;
  /** Classes for the framed wrapper. */
  frameClassName?: string;
  children: ReactNode;
}

/** The framed table. See the file comment for usage. */
export function DataTable({
  caption,
  showCaption = false,
  layout = "stack",
  minWidth = "48rem",
  className,
  frameClassName,
  style,
  children,
  ...props
}: DataTableProps) {
  const scroll = layout === "scroll";
  const table = (
    <table
      data-layout={layout}
      className={cn(
        "group/table w-full border-collapse text-left text-body-sm max-md:data-[layout=stack]:block",
        className,
      )}
      style={scroll ? { minWidth, ...style } : style}
      {...props}
    >
      <caption
        className={
          showCaption ? "caption-top border-b px-4 py-3 text-left text-caption text-muted-foreground" : "sr-only"
        }
      >
        {caption}
      </caption>
      {children}
    </table>
  );

  return scroll ? (
    // A focusable, named region, so keyboard users can scroll it sideways.
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cn("overflow-x-auto overscroll-x-contain border bg-background-raised", frameClassName)}
    >
      {table}
    </div>
  ) : (
    <div className={cn("border bg-background-raised", frameClassName)}>{table}</div>
  );
}

/** Column headers. Visually hidden in stacked rows on phones, still read by screen readers. */
export function THead({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={cn("border-b bg-surface/50 max-md:group-data-[layout=stack]/table:sr-only", className)}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("max-md:group-data-[layout=stack]/table:block", className)} {...props} />;
}

export function TFoot({ className, ...props }: ComponentProps<"tfoot">) {
  return (
    <tfoot
      className={cn("border-t bg-surface/50 font-medium max-md:group-data-[layout=stack]/table:block", className)}
      {...props}
    />
  );
}

export interface TrProps extends ComponentProps<"tr"> {
  /** The row holds a RowLink: hover highlight, and the link covers the row. */
  interactive?: boolean;
  /** Draw attention to the row (e.g. low stock). Pair with a word in a cell, never colour alone. */
  highlight?: boolean;
}

export function Tr({ interactive = false, highlight = false, className, ...props }: TrProps) {
  return (
    <tr
      className={cn(
        "border-b last:border-b-0",
        "max-md:group-data-[layout=stack]/table:flex max-md:group-data-[layout=stack]/table:flex-col max-md:group-data-[layout=stack]/table:gap-1 max-md:group-data-[layout=stack]/table:px-4 max-md:group-data-[layout=stack]/table:py-3",
        interactive && "relative transition-colors duration-150 hover:bg-surface/60 has-[a:focus-visible]:bg-surface/60",
        highlight && "bg-accent-brand/5",
        className,
      )}
      {...props}
    />
  );
}

export interface ThProps extends Omit<ComponentProps<"th">, "scope" | "align"> {
  /** Makes the header a sort link. `direction` is this column's current order, or null. */
  sort?: { href: string; direction: SortDir | null };
  align?: "start" | "end";
}

/** A column header (scope="col"), optionally a sort link with aria-sort. */
export function Th({ sort, align = "start", className, children, ...props }: ThProps) {
  const ariaSort = sort?.direction === "asc" ? "ascending" : sort?.direction === "desc" ? "descending" : undefined;

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        "px-4 py-2.5 align-bottom text-eyebrow font-medium whitespace-nowrap text-muted-foreground",
        align === "end" && "text-right",
        className,
      )}
      {...props}
    >
      {sort ? (
        <Link
          href={sort.href}
          scroll={false}
          className={cn(
            "-mx-1 inline-flex min-h-6 items-center gap-1 px-1 transition-colors hover:text-foreground",
            sort.direction && "text-foreground",
            align === "end" && "flex-row-reverse",
          )}
        >
          {children}
          <SortGlyph direction={sort.direction} />
          <span className="sr-only">
            {sort.direction === "asc"
              ? ", sorted ascending. Select to sort descending"
              : sort.direction === "desc"
                ? ", sorted descending. Select to sort ascending"
                : ", select to sort"}
          </span>
        </Link>
      ) : (
        children
      )}
    </th>
  );
}

function SortGlyph({ direction }: { direction: SortDir | null }) {
  return (
    <svg viewBox="0 0 12 12" width="0.75rem" height="0.75rem" aria-hidden="true" focusable="false" className="shrink-0">
      <path d="M3.5 5 6 2.5 8.5 5" fill="none" stroke="currentColor" strokeWidth="1.25" opacity={direction === "asc" ? 1 : 0.35} />
      <path d="M3.5 7 6 9.5 8.5 7" fill="none" stroke="currentColor" strokeWidth="1.25" opacity={direction === "desc" ? 1 : 0.35} />
    </svg>
  );
}

export interface TdProps extends Omit<ComponentProps<"td">, "align"> {
  /** Shown before the value in stacked rows on phones (usually the column header's text). */
  label?: string;
  align?: "start" | "end";
  /** In stacked rows: the block's title line (no label, full width, emphasised). */
  primary?: boolean;
  /** Leave out of stacked rows on phones (secondary detail). */
  hideOnMobile?: boolean;
}

const cellBase = "px-4 py-3 align-top";

/** A data cell. Numbers and money: align="end" (tabular figures are applied). */
export function Td({ label, align = "start", primary = false, hideOnMobile = false, className, ...props }: TdProps) {
  return (
    <td
      data-label={label}
      className={cn(
        cellBase,
        align === "end" && "text-right tabular-nums",
        "max-md:group-data-[layout=stack]/table:p-0 max-md:group-data-[layout=stack]/table:text-left",
        !primary &&
          label &&
          "max-md:group-data-[layout=stack]/table:flex max-md:group-data-[layout=stack]/table:items-baseline max-md:group-data-[layout=stack]/table:justify-between max-md:group-data-[layout=stack]/table:gap-4 max-md:group-data-[layout=stack]/table:before:shrink-0 max-md:group-data-[layout=stack]/table:before:text-caption max-md:group-data-[layout=stack]/table:before:text-muted-foreground max-md:group-data-[layout=stack]/table:before:content-[attr(data-label)]",
        !primary && !label && "max-md:group-data-[layout=stack]/table:block",
        primary && "max-md:group-data-[layout=stack]/table:block max-md:group-data-[layout=stack]/table:font-medium",
        hideOnMobile && "max-md:group-data-[layout=stack]/table:hidden",
        className,
      )}
      {...props}
    />
  );
}

export interface RowHeaderProps extends Omit<ComponentProps<"th">, "scope" | "align"> {
  align?: "start" | "end";
}

/** The cell that names its row (scope="row"), e.g. the order number. The title line in stacked rows. */
export function RowHeader({ align = "start", className, ...props }: RowHeaderProps) {
  return (
    <th
      scope="row"
      className={cn(
        cellBase,
        "font-medium",
        align === "end" && "text-right tabular-nums",
        "max-md:group-data-[layout=stack]/table:block max-md:group-data-[layout=stack]/table:p-0 max-md:group-data-[layout=stack]/table:text-left",
        className,
      )}
      {...props}
    />
  );
}

/** The link that opens a row's detail page; covers the whole row when its Tr is `interactive`. */
export function RowLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "text-foreground underline-offset-4 hover:underline",
        "after:absolute after:inset-0 after:content-['']",
        "focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-[1.5px] focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring",
        className,
      )}
      {...props}
    />
  );
}

/** A full-width row for an empty table or a note spanning every column. */
export function TableMessageRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr className="max-md:group-data-[layout=stack]/table:block">
      <td colSpan={colSpan} className="p-0 max-md:group-data-[layout=stack]/table:block">
        {children}
      </td>
    </tr>
  );
}

import type { Prisma } from "@/generated/prisma/client";

/*
 * Order numbers: ORD-<year>-<six-digit sequence>, e.g. ORD-2026-001284.
 *
 * The sequence comes from one row per year in OrderCounter, advanced with a single
 * INSERT … ON CONFLICT DO UPDATE … RETURNING. Postgres locks that row for the rest
 * of the order transaction, so concurrent checkouts queue for the next number and
 * can never share one — and a rolled-back checkout never burns a number it didn't use.
 */

/** The calendar year in Lagos (WAT, UTC+1), so orders placed on New Year's Eve evening keep their year. */
export function orderYear(now: Date): number {
  return new Date(now.getTime() + 60 * 60 * 1000).getUTCFullYear();
}

export function formatOrderNumber(year: number, sequence: number): string {
  return `ORD-${year}-${String(sequence).padStart(6, "0")}`;
}

export async function allocateOrderNumber(tx: Prisma.TransactionClient, now = new Date()): Promise<string> {
  const year = orderYear(now);
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "OrderCounter" ("year", "value") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "value" = "OrderCounter"."value" + 1
    RETURNING "value"`;
  return formatOrderNumber(year, Number(row.value));
}

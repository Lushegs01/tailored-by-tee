import "server-only";

import { siteConfig } from "@/config/site";
import { Prisma } from "@/generated/prisma/client";
import type { ProductStatus } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";

import { recordAudit } from "./audit";
import { lastPage, pageOffset, PAGE_SIZE } from "./pagination";
import {
  MAX_LOW_STOCK_THRESHOLD,
  MAX_STOCK_CHANGE,
  MAX_STOCK_COUNT,
  MAX_STOCK_NOTE,
  containsPattern,
  isAdjustReason,
  stockState,
  type AdjustReason,
  type InventoryListQuery,
  type StockChangeFailure,
  type StockHistoryPage,
  type StockLevel,
  type StockState,
} from "./stock-state";

export type {
  AdjustReason,
  InventoryListQuery,
  StockHistoryEntry,
  StockHistoryPage,
  StockState,
} from "./stock-state";

/*
 * Stock administration: adjustments, stocktakes, low-stock levels, and the
 * queries behind /admin/inventory.
 *
 * Every write is one conditional statement — "change on hand only if the result
 * stays at or above zero and at or above what's held for unpaid orders" — so it
 * can never race a checkout, a payment, another admin or a sweep into a bad
 * figure: a competing write waits for the row lock, the condition is re-checked
 * against the committed row, and a losing write matches nothing. Nothing is
 * read first and written back. The movement's InventoryAdjustment (with the
 * acting admin) is written in the same transaction, so a change never exists
 * without its record. The CHECK constraints on "Inventory" are the last line of
 * defence, not the first.
 */

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

const DEFAULT_LOW_STOCK_THRESHOLD = siteConfig.commerce.defaultLowStockThreshold;

type Tx = Prisma.TransactionClient;

interface LevelRow {
  onHand: number;
  reserved: number;
}

function cleanNote(note: string | null | undefined): string | null {
  const text = typeof note === "string" ? note.trim().slice(0, MAX_STOCK_NOTE) : "";
  return text === "" ? null : text;
}

/* ── Adjustments ─────────────────────────────────────────────────────────── */

export interface AdjustInventoryInput {
  variantId: string;
  /** Signed change to on hand, in pieces. 0 only creates the stock record (e.g. INITIAL for a new variant). */
  delta: number;
  reason: AdjustReason;
  note?: string | null;
  /** The acting admin. */
  actorId: string;
  orderId?: string | null;
  /** Run inside this transaction (e.g. with the caller's own writes); otherwise in a transaction of its own. */
  tx?: Prisma.TransactionClient;
}

export type AdjustInventoryResult =
  { ok: true; onHand: number; reserved: number } | { ok: false; reason: StockChangeFailure };

/**
 * Changes a variant's on-hand stock by `delta` and records why, atomically.
 *
 * - Removing (delta < 0): one UPDATE … WHERE "onHand" + delta >= "reserved" AND
 *   "onHand" + delta >= 0. No row matched → a follow-up read names the reason.
 * - Adding (delta >= 0): one INSERT … ON CONFLICT DO UPDATE, which also creates
 *   the stock record for a variant that has none yet.
 *
 * Returns the new levels, or why nothing changed. Throws RangeError for input no
 * caller should send (a fractional or enormous delta, an unknown reason).
 */
export async function adjustInventory(input: AdjustInventoryInput): Promise<AdjustInventoryResult> {
  const { variantId, delta, reason, actorId } = input;
  if (!Number.isSafeInteger(delta) || Math.abs(delta) > MAX_STOCK_CHANGE) {
    throw new RangeError(`adjustInventory: delta must be a whole number within ±${MAX_STOCK_CHANGE}`);
  }
  if (!isAdjustReason(reason)) throw new RangeError(`adjustInventory: unknown reason ${String(reason)}`);
  const note = cleanNote(input.note);

  const run = async (tx: Tx): Promise<AdjustInventoryResult> => {
    const result = await applyDelta(tx, variantId, delta);
    if (!result.ok) return result;
    await tx.inventoryAdjustment.create({
      data: {
        variantId,
        onHandDelta: delta,
        reservedDelta: 0,
        reason,
        note,
        orderId: input.orderId ?? null,
        actorId,
      },
      select: { id: true },
    });
    return result;
  };

  return input.tx ? run(input.tx) : getDb().$transaction(run, TRANSACTION_OPTIONS);
}

async function applyDelta(tx: Tx, variantId: string, delta: number): Promise<AdjustInventoryResult> {
  // A second attempt only if the follow-up read finds the change would now succeed
  // (a competing write landed between the two statements).
  for (let attempt = 0; attempt < 2; attempt++) {
    const rows =
      delta >= 0
        ? await tx.$queryRaw<LevelRow[]>`
            INSERT INTO "Inventory" ("variantId", "onHand", "reserved", "lowStockThreshold", "updatedAt")
            SELECT v."id", ${delta}::int, 0, ${DEFAULT_LOW_STOCK_THRESHOLD}::int, NOW()
            FROM "ProductVariant" v
            WHERE v."id" = ${variantId}
            ON CONFLICT ("variantId") DO UPDATE
              SET "onHand" = "Inventory"."onHand" + EXCLUDED."onHand", "updatedAt" = NOW()
            RETURNING "onHand", "reserved"`
        : await tx.$queryRaw<LevelRow[]>`
            UPDATE "Inventory"
            SET "onHand" = "onHand" + ${delta}::int, "updatedAt" = NOW()
            WHERE "variantId" = ${variantId}
              AND "onHand" + ${delta}::int >= "reserved"
              AND "onHand" + ${delta}::int >= 0
            RETURNING "onHand", "reserved"`;

    const row = rows[0];
    if (row) return { ok: true, onHand: Number(row.onHand), reserved: Number(row.reserved) };

    const failure = await explainRefusedDelta(tx, variantId, delta);
    if (failure) return { ok: false, reason: failure };
  }
  return { ok: false, reason: "below_reserved" };
}

/** Why a conditional change matched no row, from the committed state; null when it would succeed now. */
async function explainRefusedDelta(
  tx: Tx,
  variantId: string,
  delta: number,
): Promise<StockChangeFailure | null> {
  const level = await tx.inventory.findUnique({
    where: { variantId },
    select: { onHand: true, reserved: true },
  });
  if (!level) {
    const variant = await tx.productVariant.findUnique({ where: { id: variantId }, select: { id: true } });
    if (!variant) return "not_found";
    return delta < 0 ? "negative" : null;
  }
  const next = level.onHand + delta;
  if (next < 0) return "negative";
  if (next < level.reserved) return "below_reserved";
  return null;
}

/* ── Stocktake ───────────────────────────────────────────────────────────── */

export type CountedStockResult =
  | { ok: true; onHand: number; reserved: number; delta: number }
  | { ok: false; reason: "not_found" }
  /** On hand moved (a sale, a release, another admin) since the count began. */
  | { ok: false; reason: "changed"; onHand: number; reserved: number }
  /** The count is lower than what's held for unpaid orders. */
  | { ok: false; reason: "below_reserved"; onHand: number; reserved: number };

/**
 * Records a physical count: sets on hand to `counted`, but only if on hand is
 * still `expectedOnHand` (what the admin saw when they started counting) — so a
 * sale in the meantime makes it fail rather than silently undo the sale. Saved
 * as a CORRECTION with the difference (0 when the count matched, which is still
 * worth a line in the history).
 */
export async function setCountedStock(
  variantId: string,
  counted: number,
  expectedOnHand: number,
  actorId: string,
  note?: string | null,
): Promise<CountedStockResult> {
  if (!Number.isSafeInteger(counted) || counted < 0 || counted > MAX_STOCK_COUNT) {
    throw new RangeError(`setCountedStock: counted must be a whole number from 0 to ${MAX_STOCK_COUNT}`);
  }
  if (!Number.isSafeInteger(expectedOnHand) || expectedOnHand < 0) {
    throw new RangeError("setCountedStock: expectedOnHand must be a whole number of 0 or more");
  }
  const extra = cleanNote(note);

  return getDb().$transaction(async (tx): Promise<CountedStockResult> => {
    let rows = await tx.$queryRaw<LevelRow[]>`
      UPDATE "Inventory"
      SET "onHand" = ${counted}::int, "updatedAt" = NOW()
      WHERE "variantId" = ${variantId}
        AND "onHand" = ${expectedOnHand}::int
        AND "reserved" <= ${counted}::int
      RETURNING "onHand", "reserved"`;

    if (rows.length === 0 && expectedOnHand === 0) {
      // No stock record yet (the list shows it as 0): create it with the count.
      rows = await tx.$queryRaw<LevelRow[]>`
        INSERT INTO "Inventory" ("variantId", "onHand", "reserved", "lowStockThreshold", "updatedAt")
        SELECT v."id", ${counted}::int, 0, ${DEFAULT_LOW_STOCK_THRESHOLD}::int, NOW()
        FROM "ProductVariant" v
        WHERE v."id" = ${variantId}
        ON CONFLICT ("variantId") DO NOTHING
        RETURNING "onHand", "reserved"`;
    }

    const row = rows[0];
    if (!row) {
      const level = await tx.inventory.findUnique({
        where: { variantId },
        select: { onHand: true, reserved: true },
      });
      if (!level) {
        const variant = await tx.productVariant.findUnique({
          where: { id: variantId },
          select: { id: true },
        });
        return variant
          ? { ok: false, reason: "changed", onHand: 0, reserved: 0 }
          : { ok: false, reason: "not_found" };
      }
      if (level.onHand === expectedOnHand && level.reserved > counted) {
        return { ok: false, reason: "below_reserved", onHand: level.onHand, reserved: level.reserved };
      }
      return { ok: false, reason: "changed", onHand: level.onHand, reserved: level.reserved };
    }

    const delta = counted - expectedOnHand;
    const summary =
      delta === 0
        ? `Stocktake: counted ${counted}, matching the record.`
        : `Stocktake: counted ${counted} (record said ${expectedOnHand}).`;
    await tx.inventoryAdjustment.create({
      data: {
        variantId,
        onHandDelta: delta,
        reservedDelta: 0,
        reason: "CORRECTION",
        note: extra ? `${summary} ${extra}`.slice(0, MAX_STOCK_NOTE + 80) : summary,
        actorId,
      },
      select: { id: true },
    });
    return { ok: true, onHand: Number(row.onHand), reserved: Number(row.reserved), delta };
  }, TRANSACTION_OPTIONS);
}

/* ── Low-stock level ─────────────────────────────────────────────────────── */

/**
 * Sets the level at or below which a variant counts as low stock (creating its
 * stock record at zero if it has none), with an audit entry naming the admin.
 * False when the variant doesn't exist or the level isn't a whole number from 0
 * to MAX_LOW_STOCK_THRESHOLD.
 */
export async function setLowStockThreshold(
  variantId: string,
  threshold: number,
  actorId: string,
): Promise<boolean> {
  if (!Number.isSafeInteger(threshold) || threshold < 0 || threshold > MAX_LOW_STOCK_THRESHOLD) return false;

  return getDb().$transaction(async (tx) => {
    // One statement: the previous level (for the audit entry) is read from the same snapshot the upsert changes.
    const rows = await tx.$queryRaw<{ sku: string; previous: number | null }[]>`
      WITH target AS (
        SELECT v."id", v."sku", i."lowStockThreshold" AS "previous"
        FROM "ProductVariant" v
        LEFT JOIN "Inventory" i ON i."variantId" = v."id"
        WHERE v."id" = ${variantId}
      ), saved AS (
        INSERT INTO "Inventory" ("variantId", "onHand", "reserved", "lowStockThreshold", "updatedAt")
        SELECT target."id", 0, 0, ${threshold}::int, NOW() FROM target
        ON CONFLICT ("variantId") DO UPDATE
          SET "lowStockThreshold" = EXCLUDED."lowStockThreshold", "updatedAt" = NOW()
        RETURNING "variantId"
      )
      SELECT target."sku", target."previous" FROM target JOIN saved ON saved."variantId" = target."id"`;

    const row = rows[0];
    if (!row) return false;

    const previous = row.previous === null ? null : Number(row.previous);
    await recordAudit({
      tx,
      actorId,
      action: "inventory.threshold",
      entityType: "ProductVariant",
      entityId: variantId,
      summary:
        previous === null || previous === threshold
          ? `Set the low-stock level of ${row.sku} to ${threshold}.`
          : `Changed the low-stock level of ${row.sku} from ${previous} to ${threshold}.`,
      metadata: { sku: row.sku, before: previous, after: threshold },
    });
    return true;
  }, TRANSACTION_OPTIONS);
}

/* ── Reading one variant ─────────────────────────────────────────────────── */

export interface VariantStock extends StockLevel {
  variantId: string;
  sku: string;
  productName: string;
  colorName: string;
  sizeLabel: string;
}

/** A variant's names and current stock (0s when it has no stock record), or null when it doesn't exist. */
export async function getVariantStock(variantId: string): Promise<VariantStock | null> {
  const variant = await getDb().productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      sku: true,
      product: { select: { name: true } },
      color: { select: { name: true } },
      size: { select: { label: true } },
      inventory: { select: { onHand: true, reserved: true, lowStockThreshold: true } },
    },
  });
  if (!variant) return null;
  return {
    variantId: variant.id,
    sku: variant.sku,
    productName: variant.product.name,
    colorName: variant.color.name,
    sizeLabel: variant.size.label,
    onHand: variant.inventory?.onHand ?? 0,
    reserved: variant.inventory?.reserved ?? 0,
    lowStockThreshold: variant.inventory?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
  };
}

const ORDER_NUMBER = /^[A-Z0-9-]{1,40}$/;

/** An order's id from its number ("ORD-2026-001284", any case), or null. */
export async function findOrderIdByNumber(number: string): Promise<string | null> {
  const text = number.trim().toUpperCase();
  if (!ORDER_NUMBER.test(text)) return null;
  const order = await getDb().order.findUnique({ where: { number: text }, select: { id: true } });
  return order?.id ?? null;
}

/**
 * The order a returned piece came from, by its number (any case): its id and
 * canonical number, and whether it included this variant. Null when there is no
 * such order.
 */
export async function findOrderForReturn(
  number: string,
  variantId: string,
): Promise<{ id: string; number: string; includesVariant: boolean } | null> {
  const text = number.trim().toUpperCase();
  if (!ORDER_NUMBER.test(text)) return null;
  const order = await getDb().order.findUnique({
    where: { number: text },
    select: { id: true, number: true, items: { where: { variantId }, select: { id: true }, take: 1 } },
  });
  if (!order) return null;
  return { id: order.id, number: order.number, includesVariant: order.items.length > 0 };
}

/* ── The inventory list ──────────────────────────────────────────────────── */

export interface InventoryRow extends StockLevel {
  variantId: string;
  sku: string;
  /** False when the variant is switched off (not offered in the store). */
  isActive: boolean;
  productId: string;
  productName: string;
  productStatus: ProductStatus;
  categoryName: string;
  colorName: string;
  colorHex: string;
  sizeLabel: string;
  /** On hand minus held, never below 0. */
  available: number;
  state: StockState;
  /** Pieces in paid orders that haven't shipped: already out of on hand, but still on the shelf. */
  awaitingShipment: number;
  /** When the stock record last changed (ISO), or null when there is none. */
  stockUpdatedAt: string | null;
}

export interface InventorySummary {
  /** Variants matching the search and filters (every stock state). */
  variants: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  piecesOnHand: number;
  piecesHeld: number;
  piecesAvailable: number;
}

export interface InventoryListResult {
  rows: InventoryRow[];
  /** Rows matching every filter, including the stock state. */
  total: number;
  /** The page shown, clamped to the last page. */
  page: number;
  /** Counts for the search and filters without the stock-state filter, so each state's figure matches its filter. */
  summary: InventorySummary;
}

const FROM_VARIANTS = Prisma.sql`
  FROM "ProductVariant" v
  JOIN "Product" p ON p."id" = v."productId"
  JOIN "Category" c ON c."id" = p."categoryId"
  JOIN "Color" col ON col."id" = v."colorId"
  JOIN "Size" s ON s."id" = v."sizeId"
  LEFT JOIN "Inventory" i ON i."variantId" = v."id"`;

const ON_HAND = Prisma.sql`COALESCE(i."onHand", 0)`;
const RESERVED = Prisma.sql`COALESCE(i."reserved", 0)`;
const AVAILABLE = Prisma.sql`(COALESCE(i."onHand", 0) - COALESCE(i."reserved", 0))`;
const THRESHOLD = Prisma.sql`COALESCE(i."lowStockThreshold", ${DEFAULT_LOW_STOCK_THRESHOLD}::int)`;

function stateCondition(state: StockState): Prisma.Sql {
  switch (state) {
    case "out_of_stock":
      return Prisma.sql`${AVAILABLE} <= 0`;
    case "low_stock":
      return Prisma.sql`${AVAILABLE} > 0 AND ${AVAILABLE} <= ${THRESHOLD}`;
    default:
      return Prisma.sql`${AVAILABLE} > ${THRESHOLD}`;
  }
}

function whereClause(query: InventoryListQuery, withState: boolean): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (!query.includeInactive) conditions.push(Prisma.sql`v."isActive" = true`);
  if (query.productStatus) conditions.push(Prisma.sql`p."status" = ${query.productStatus}::"ProductStatus"`);
  else if (!query.includeArchived) conditions.push(Prisma.sql`p."status" <> 'ARCHIVED'::"ProductStatus"`);
  if (query.categorySlug) conditions.push(Prisma.sql`c."slug" = ${query.categorySlug}`);
  if (query.q) {
    const pattern = containsPattern(query.q);
    conditions.push(Prisma.sql`(v."sku" ILIKE ${pattern} OR p."name" ILIKE ${pattern})`);
  }
  if (withState && query.state) conditions.push(stateCondition(query.state));
  return conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
}

function orderClause(query: InventoryListQuery): Prisma.Sql {
  const dir = Prisma.raw(query.dir === "desc" ? "DESC" : "ASC");
  const byOption = Prisma.sql`col."sortOrder" ASC, s."sortOrder" ASC, v."sku" ASC`;
  switch (query.sort) {
    case "sku":
      return Prisma.sql`ORDER BY v."sku" ${dir}`;
    case "product":
      return Prisma.sql`ORDER BY p."name" ${dir}, ${byOption}`;
    default:
      return Prisma.sql`ORDER BY GREATEST(${AVAILABLE}, 0) ${dir}, p."name" ASC, ${byOption}`;
  }
}

interface RawInventoryRow {
  variantId: string;
  sku: string;
  isActive: boolean;
  productId: string;
  productName: string;
  productStatus: ProductStatus;
  categoryName: string;
  colorName: string;
  colorHex: string;
  sizeLabel: string;
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
  awaitingShipment: number;
  stockUpdatedAt: Date | string | null;
}

async function selectRows(query: InventoryListQuery, limit: number, offset: number): Promise<InventoryRow[]> {
  const rows = await getDb().$queryRaw<RawInventoryRow[]>`
    WITH awaiting AS (
      SELECT oi."variantId", SUM(oi."quantity")::int AS "pieces"
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      WHERE o."status" IN ('PAID', 'PROCESSING') AND oi."variantId" IS NOT NULL
      GROUP BY oi."variantId"
    )
    SELECT
      v."id" AS "variantId",
      v."sku",
      v."isActive",
      p."id" AS "productId",
      p."name" AS "productName",
      p."status"::text AS "productStatus",
      c."name" AS "categoryName",
      col."name" AS "colorName",
      col."hex" AS "colorHex",
      s."label" AS "sizeLabel",
      ${ON_HAND}::int AS "onHand",
      ${RESERVED}::int AS "reserved",
      ${THRESHOLD}::int AS "lowStockThreshold",
      COALESCE(a."pieces", 0)::int AS "awaitingShipment",
      i."updatedAt" AS "stockUpdatedAt"
    ${FROM_VARIANTS}
    LEFT JOIN awaiting a ON a."variantId" = v."id"
    ${whereClause(query, true)}
    ${orderClause(query)}
    LIMIT ${limit}::int OFFSET ${offset}::int`;

  return rows.map((row) => {
    const level = {
      onHand: Number(row.onHand),
      reserved: Number(row.reserved),
      lowStockThreshold: Number(row.lowStockThreshold),
    };
    const updatedAt = row.stockUpdatedAt === null ? null : new Date(row.stockUpdatedAt);
    return {
      variantId: row.variantId,
      sku: row.sku,
      isActive: Boolean(row.isActive),
      productId: row.productId,
      productName: row.productName,
      productStatus: row.productStatus,
      categoryName: row.categoryName,
      colorName: row.colorName,
      colorHex: row.colorHex,
      sizeLabel: row.sizeLabel,
      ...level,
      available: Math.max(0, level.onHand - level.reserved),
      state: stockState(level),
      awaitingShipment: Number(row.awaitingShipment) || 0,
      stockUpdatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt.toISOString() : null,
    };
  });
}

async function selectSummary(query: InventoryListQuery): Promise<InventorySummary> {
  const rows = await getDb().$queryRaw<Record<keyof InventorySummary, number>[]>`
    SELECT
      COUNT(*)::int AS "variants",
      (COUNT(*) FILTER (WHERE ${stateCondition("in_stock")}))::int AS "inStock",
      (COUNT(*) FILTER (WHERE ${stateCondition("low_stock")}))::int AS "lowStock",
      (COUNT(*) FILTER (WHERE ${stateCondition("out_of_stock")}))::int AS "outOfStock",
      COALESCE(SUM(${ON_HAND}), 0)::int AS "piecesOnHand",
      COALESCE(SUM(${RESERVED}), 0)::int AS "piecesHeld",
      COALESCE(SUM(GREATEST(${AVAILABLE}, 0)), 0)::int AS "piecesAvailable"
    ${FROM_VARIANTS}
    ${whereClause(query, false)}`;
  const row = rows[0];
  const read = (key: keyof InventorySummary) => Number(row?.[key]) || 0;
  return {
    variants: read("variants"),
    inStock: read("inStock"),
    lowStock: read("lowStock"),
    outOfStock: read("outOfStock"),
    piecesOnHand: read("piecesOnHand"),
    piecesHeld: read("piecesHeld"),
    piecesAvailable: read("piecesAvailable"),
  };
}

function totalFor(summary: InventorySummary, state: StockState | null): number {
  switch (state) {
    case "in_stock":
      return summary.inStock;
    case "low_stock":
      return summary.lowStock;
    case "out_of_stock":
      return summary.outOfStock;
    default:
      return summary.variants;
  }
}

/** One page of variants with their stock, and the figures for the filters around it. */
export async function listInventory(
  query: InventoryListQuery,
  pageSize: number = PAGE_SIZE,
): Promise<InventoryListResult> {
  const summary = await selectSummary(query);
  const total = totalFor(summary, query.state);
  const page = Math.min(query.page, lastPage(total, pageSize));
  const rows = total > 0 ? await selectRows(query, pageSize, pageOffset(page, pageSize)) : [];
  return { rows, total, page, summary };
}

/** Most rows one CSV export holds. */
export const INVENTORY_EXPORT_LIMIT = 20_000;

/** Every variant matching the query (up to the export limit), in the list's order. */
export async function listInventoryForExport(
  query: InventoryListQuery,
): Promise<{ rows: InventoryRow[]; truncated: boolean }> {
  const rows = await selectRows(query, INVENTORY_EXPORT_LIMIT + 1, 0);
  return { rows: rows.slice(0, INVENTORY_EXPORT_LIMIT), truncated: rows.length > INVENTORY_EXPORT_LIMIT };
}

/** Categories for the filter, in store order. */
export async function getInventoryCategories(): Promise<{ slug: string; name: string }[]> {
  return getDb().category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { slug: true, name: true },
  });
}

/* ── History ─────────────────────────────────────────────────────────────── */

export const STOCK_HISTORY_PAGE_SIZE = 30;

/** A variant's stock movements, newest first, a page at a time. Null when the variant doesn't exist. */
export async function getVariantStockHistory(
  variantId: string,
  options: { before?: string | null; take?: number } = {},
): Promise<StockHistoryPage | null> {
  const db = getDb();
  const take = Math.min(Math.max(1, Math.trunc(options.take ?? STOCK_HISTORY_PAGE_SIZE)), 100);

  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      sku: true,
      product: { select: { name: true } },
      color: { select: { name: true } },
      size: { select: { label: true } },
    },
  });
  if (!variant) return null;

  // The cursor must be one of this variant's own entries; anything else starts from the newest.
  const cursor = options.before
    ? await db.inventoryAdjustment.findFirst({
        where: { id: options.before, variantId },
        select: { id: true },
      })
    : null;

  const rows = await db.inventoryAdjustment.findMany({
    where: { variantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      onHandDelta: true,
      reservedDelta: true,
      reason: true,
      note: true,
      order: { select: { id: true, number: true } },
      actor: { select: { email: true } },
    },
  });

  const page = rows.slice(0, take);
  return {
    variant: {
      variantId: variant.id,
      sku: variant.sku,
      productName: variant.product.name,
      colorName: variant.color.name,
      sizeLabel: variant.size.label,
    },
    entries: page.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      onHandDelta: row.onHandDelta,
      reservedDelta: row.reservedDelta,
      reason: row.reason,
      note: row.note,
      order: row.order,
      actorEmail: row.actor?.email ?? null,
    })),
    nextCursor: rows.length > take ? (page.at(-1)?.id ?? null) : null,
  };
}

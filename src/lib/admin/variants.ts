import "server-only";

import {
  MAX_PRODUCT_COLORS,
  canRemoveOption,
  comboKey,
  insertSizeInOrder,
  joinWords,
  moveInList,
  optionRemovalAdvice,
  optionRemovalProblem,
  optionUsage,
  ordinal,
  productSizeSystem,
  sizeAddProblem,
  sizeSystemLabel,
  variantCount,
  variantDeleteBlock,
  variantDeleteBlockedMessage,
  variantOptionLabel,
  type OptionSize,
  type ProductVariantsData,
  type VariantFacts,
} from "@/components/admin/products/variants/variant-rules";
import { siteConfig } from "@/config/site";
import { Prisma } from "@/generated/prisma/client";
import type { ProductStatus, SizeSystem } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";

import { recordAudit } from "./audit";
import type { AdminActionResult } from "./auth";
import { formatKobo } from "./format";
import { insertRegistryColor, insertRegistrySize, listColorRegistry, listSizeRegistry } from "./options";
import { buildVariantSku, skuPartProblem } from "./sku";
import { MAX_STOCK_CHANGE, pieces } from "./stock-state";

/*
 * A product's colours, sizes and variants: the data behind the editor's
 * "Colours and sizes" and "Variants and stock" sections, and every change to them.
 *
 * Each change runs in one transaction that first locks the product row (FOR NO
 * KEY UPDATE: admin edits of the same product take turns — including the photo
 * actions, which lock it FOR UPDATE — while checkouts, whose order lines only
 * need a key-share lock on it, are never held up). Every colour, size and
 * variant id from the browser is checked to belong to the product named in the
 * request. The audit entry is written in the same transaction, naming the admin.
 *
 * Removing a colour, size or variant deletes variants, which is only allowed
 * when none has ever been ordered (orders keep a link to what was bought) and
 * none has stock. The check runs after locking the variants' stock rows and then
 * the variants themselves — stock first, the order checkouts take them in, so
 * the two can't deadlock — so a checkout can't slip in between the check and the
 * delete: one already under way finishes first and is seen by the check; one
 * that starts later finds the variant gone.
 *
 * Opening stock for new variants is written with the variants in the same
 * transaction (Inventory row plus an INITIAL adjustment naming the admin). Later
 * stock changes go through lib/admin/inventory.
 */

type Tx = Prisma.TransactionClient;
type Result<T = null> = AdminActionResult<T>;
type Failure = Extract<AdminActionResult, { ok: false }>;

const TRANSACTION = { maxWait: 10_000, timeout: 20_000 } as const;
const DEFAULT_LOW_STOCK_THRESHOLD = siteConfig.commerce.defaultLowStockThreshold;

const PRODUCT_GONE = "This product no longer exists. Go back to the product list.";
const REFRESH = "Refresh the page to see the latest, then try again.";
const VARIANT_GONE = `That variant is no longer on this product. ${REFRESH}`;

function fail(message: string, fieldErrors?: Record<string, string>): Failure {
  return fieldErrors ? { ok: false, message, fieldErrors } : { ok: false, message };
}

/** Ends a transaction early with a failure, rolling back what it had written. */
class Rollback extends Error {
  constructor(readonly result: Failure) {
    super("rollback");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Runs `run` in a transaction. A Rollback returns its failure; a unique-constraint
 * clash (someone else created the same thing a moment earlier) returns `clash`.
 */
async function inTransaction<T>(run: (tx: Tx) => Promise<Result<T>>, clash?: string): Promise<Result<T>> {
  try {
    return await getDb().$transaction(run, TRANSACTION);
  } catch (error) {
    if (error instanceof Rollback) return error.result;
    if (clash && isUniqueViolation(error)) return fail(clash);
    throw error;
  }
}

/* ── Reading ────────────────────────────────────────────────────────────── */

/**
 * Everything the variants sections show for one product: its colours and sizes
 * in order, every variant with its stock and order history counts, and the
 * colour and size registries. Null when the product doesn't exist.
 */
export async function getProductVariantsData(productId: string): Promise<ProductVariantsData | null> {
  const db = getDb();
  const [product, awaiting, photos, registryColors, registrySizes] = await Promise.all([
    db.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        price: true,
        category: { select: { name: true, code: true } },
        colors: {
          orderBy: [{ position: "asc" }, { colorId: "asc" }],
          select: { color: { select: { id: true, name: true, hex: true, code: true } } },
        },
        sizes: {
          orderBy: [{ position: "asc" }, { sizeId: "asc" }],
          select: { size: { select: { id: true, label: true, system: true, code: true, sortOrder: true } } },
        },
        variants: {
          orderBy: { sku: "asc" },
          select: {
            id: true,
            sku: true,
            colorId: true,
            sizeId: true,
            isActive: true,
            priceOverride: true,
            color: { select: { name: true, hex: true } },
            size: { select: { label: true } },
            inventory: { select: { onHand: true, reserved: true, lowStockThreshold: true } },
            _count: { select: { orderItems: true } },
          },
        },
      },
    }),
    db.orderItem.groupBy({
      by: ["variantId"],
      where: { variant: { is: { productId } }, order: { is: { status: { in: ["PAID", "PROCESSING"] } } } },
      _sum: { quantity: true },
    }),
    db.productImage.groupBy({
      by: ["colorId"],
      where: { productId, colorId: { not: null } },
      _count: { _all: true },
    }),
    listColorRegistry(),
    listSizeRegistry(),
  ]);
  if (!product) return null;

  const awaitingByVariant = new Map(awaiting.map((row) => [row.variantId, row._sum.quantity ?? 0]));
  const photosByColor = new Map(photos.map((row) => [row.colorId, row._count._all]));

  return {
    product: {
      id: product.id,
      name: product.name,
      code: product.code,
      status: product.status,
      price: product.price,
      categoryName: product.category.name,
      categoryCode: product.category.code,
    },
    colors: product.colors.map(({ color }) => ({ ...color, photos: photosByColor.get(color.id) ?? 0 })),
    sizes: product.sizes.map(({ size }) => size),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      colorId: variant.colorId,
      colorName: variant.color.name,
      colorHex: variant.color.hex,
      sizeId: variant.sizeId,
      sizeLabel: variant.size.label,
      isActive: variant.isActive,
      priceOverride: variant.priceOverride,
      onHand: variant.inventory?.onHand ?? 0,
      reserved: variant.inventory?.reserved ?? 0,
      lowStockThreshold: variant.inventory?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
      orderLines: variant._count.orderItems,
      awaitingShipment: awaitingByVariant.get(variant.id) ?? 0,
    })),
    registry: { colors: registryColors, sizes: registrySizes },
  };
}

/* ── Locks and links ────────────────────────────────────────────────────── */

interface LockedProduct {
  id: string;
  name: string;
  code: string;
  status: ProductStatus;
  price: number;
  categoryCode: string;
}

/** Locks the product row for the rest of the transaction (see the file comment). Null when it doesn't exist. */
async function lockProduct(tx: Tx, productId: string): Promise<LockedProduct | null> {
  const rows = await tx.$queryRaw<LockedProduct[]>`
    SELECT p."id", p."name", p."code", p."status"::text AS "status", p."price", c."code" AS "categoryCode"
    FROM "Product" p
    JOIN "Category" c ON c."id" = p."categoryId"
    WHERE p."id" = ${productId}
    FOR NO KEY UPDATE OF p`;
  const row = rows[0];
  return row ? { ...row, price: Number(row.price) } : null;
}

interface ColorLink {
  id: string;
  name: string;
  code: string;
  position: number;
}

async function colorLinks(tx: Tx, productId: string): Promise<ColorLink[]> {
  const links = await tx.productColor.findMany({
    where: { productId },
    orderBy: [{ position: "asc" }, { colorId: "asc" }],
    select: { colorId: true, position: true, color: { select: { name: true, code: true } } },
  });
  return links.map((link) => ({ id: link.colorId, name: link.color.name, code: link.color.code, position: link.position }));
}

interface SizeLink extends OptionSize {
  position: number;
}

async function sizeLinks(tx: Tx, productId: string): Promise<SizeLink[]> {
  const links = await tx.productSize.findMany({
    where: { productId },
    orderBy: [{ position: "asc" }, { sizeId: "asc" }],
    select: {
      position: true,
      size: { select: { id: true, label: true, system: true, code: true, sortOrder: true } },
    },
  });
  return links.map((link) => ({ ...link.size, position: link.position }));
}

/** Stores the product's colours in `ordered` order, as positions 0, 1, 2 … (only changed rows are written). */
async function writeColorOrder(tx: Tx, productId: string, ordered: readonly string[], current: readonly ColorLink[]) {
  for (const [index, colorId] of ordered.entries()) {
    if (current.find((link) => link.id === colorId)?.position === index) continue;
    await tx.productColor.update({ where: { productId_colorId: { productId, colorId } }, data: { position: index } });
  }
}

async function writeSizeOrder(tx: Tx, productId: string, ordered: readonly string[], current: readonly SizeLink[]) {
  for (const [index, sizeId] of ordered.entries()) {
    if (current.find((link) => link.id === sizeId)?.position === index) continue;
    await tx.productSize.update({ where: { productId_sizeId: { productId, sizeId } }, data: { position: index } });
  }
}

interface VariantFactsRow extends VariantFacts {
  id: string;
  sku: string;
  colorName: string;
  sizeLabel: string;
}

/** Fresh stock and order facts for the product's variants matching `condition` (a fragment on `v`). */
async function readVariantFacts(tx: Tx, productId: string, condition: Prisma.Sql): Promise<VariantFactsRow[]> {
  const rows = await tx.$queryRaw<VariantFactsRow[]>`
    SELECT
      v."id",
      v."sku",
      v."isActive",
      c."name" AS "colorName",
      s."label" AS "sizeLabel",
      COALESCE(i."onHand", 0)::int AS "onHand",
      COALESCE(i."reserved", 0)::int AS "reserved",
      (SELECT COUNT(*) FROM "OrderItem" oi WHERE oi."variantId" = v."id")::int AS "orderLines"
    FROM "ProductVariant" v
    JOIN "Color" c ON c."id" = v."colorId"
    JOIN "Size" s ON s."id" = v."sizeId"
    LEFT JOIN "Inventory" i ON i."variantId" = v."id"
    WHERE v."productId" = ${productId} AND ${condition}
    ORDER BY v."sku"`;
  return rows.map((row) => ({
    ...row,
    isActive: Boolean(row.isActive),
    onHand: Number(row.onHand),
    reserved: Number(row.reserved),
    orderLines: Number(row.orderLines),
  }));
}

/**
 * Locks the stock rows, then the variant rows, of the product's variants matching
 * `condition` — in that order, the order checkouts take them in — so nothing can
 * be sold, held or ordered until this transaction ends. Read the facts afterwards.
 */
async function lockVariants(tx: Tx, productId: string, condition: Prisma.Sql): Promise<void> {
  await tx.$queryRaw`
    SELECT i."variantId"
    FROM "Inventory" i
    JOIN "ProductVariant" v ON v."id" = i."variantId"
    WHERE v."productId" = ${productId} AND ${condition}
    ORDER BY i."variantId"
    FOR UPDATE OF i`;
  await tx.$queryRaw`
    SELECT v."id"
    FROM "ProductVariant" v
    WHERE v."productId" = ${productId} AND ${condition}
    ORDER BY v."id"
    FOR UPDATE OF v`;
}

function saleWords(status: ProductStatus, hasStock: boolean): string {
  if (status === "DRAFT") return " They go on sale when the product is live.";
  if (status === "ARCHIVED") return " The product is archived, so they aren’t on sale.";
  return hasStock ? " Customers can buy them now." : " Add stock to put them on sale.";
}

/* ── Colours ────────────────────────────────────────────────────────────── */

/** Adds registry colours to the end of the product's colours, in the order given. */
export async function addColorsToProduct(input: {
  productId: string;
  colorIds: readonly string[];
  actorId: string;
}): Promise<Result> {
  const { productId, actorId } = input;
  const wanted = [...new Set(input.colorIds)];
  if (wanted.length === 0) return fail("Choose at least one colour.", { colorId: "Choose at least one colour." });

  return inTransaction(async (tx) => {
    const product = await lockProduct(tx, productId);
    if (!product) return fail(PRODUCT_GONE);

    const current = await colorLinks(tx, productId);
    const fresh = wanted.filter((id) => !current.some((link) => link.id === id));
    if (fresh.length === 0) {
      return fail(
        wanted.length === 1 ? "That colour is already on this product." : "Those colours are already on this product.",
      );
    }
    if (current.length + fresh.length > MAX_PRODUCT_COLORS) {
      const room = MAX_PRODUCT_COLORS - current.length;
      const message =
        room <= 0
          ? `A product can have up to ${MAX_PRODUCT_COLORS} colours.`
          : `A product can have up to ${MAX_PRODUCT_COLORS} colours, so you can add ${room} more.`;
      return fail(message, { colorId: message });
    }

    const found = await tx.color.findMany({ where: { id: { in: fresh } }, select: { id: true, name: true } });
    if (found.length !== fresh.length) return fail(`One of those colours no longer exists. ${REFRESH}`);
    const names = fresh.map((id) => found.find((color) => color.id === id)?.name ?? id);

    await tx.productColor.createMany({
      data: fresh.map((colorId, index) => ({ productId, colorId, position: current.length + index })),
    });
    await writeColorOrder(tx, productId, current.map((link) => link.id), current);

    await recordAudit({
      tx,
      actorId,
      action: "product.color.add",
      entityType: "Product",
      entityId: productId,
      summary: `Added ${joinWords(names)} to ${product.name}.`,
      metadata: { productId, colorIds: fresh },
    });

    const skipped = wanted.length - fresh.length;
    return {
      ok: true,
      data: null,
      message:
        `Added ${joinWords(names)} to ${product.name}. Next, create ${fresh.length === 1 ? "its" : "their"} variants under “Variants and stock”.` +
        (skipped > 0 ? ` ${skipped === 1 ? "One was" : `${skipped} were`} already on the product.` : ""),
    };
  });
}

/** Creates a colour in the registry and adds it to the end of the product's colours, in one transaction. */
export async function createColorForProduct(input: {
  productId: string;
  name: string;
  hex: string;
  code: string;
  actorId: string;
}): Promise<Result> {
  const { productId, actorId } = input;
  return inTransaction(
    async (tx) => {
      const product = await lockProduct(tx, productId);
      if (!product) return fail(PRODUCT_GONE);

      const current = await colorLinks(tx, productId);
      if (current.length >= MAX_PRODUCT_COLORS) return fail(`A product can have up to ${MAX_PRODUCT_COLORS} colours.`);

      const created = await insertRegistryColor(tx, { name: input.name, hex: input.hex, code: input.code, actorId });
      if (!created.ok) return fail(created.message, { [created.field]: created.message });
      const color = created.entry;

      await tx.productColor.create({ data: { productId, colorId: color.id, position: current.length } });
      await writeColorOrder(tx, productId, current.map((link) => link.id), current);

      await recordAudit({
        tx,
        actorId,
        action: "product.color.add",
        entityType: "Product",
        entityId: productId,
        summary: `Added the new colour ${color.name} to ${product.name}.`,
        metadata: { productId, colorIds: [color.id], created: true },
      });

      return {
        ok: true,
        data: null,
        message: `Created ${color.name} (${color.code}) and added it to ${product.name}. Next, create its variants under “Variants and stock”.`,
      };
    },
    "A colour with this name or code was added a moment ago. Refresh the page and choose it from your colours.",
  );
}

/** Moves one of the product's colours a place earlier ("up") or later ("down"). */
export async function moveProductColor(input: {
  productId: string;
  colorId: string;
  direction: "up" | "down";
  actorId: string;
}): Promise<Result> {
  const { productId, colorId, direction, actorId } = input;
  return inTransaction(async (tx) => {
    const product = await lockProduct(tx, productId);
    if (!product) return fail(PRODUCT_GONE);

    const current = await colorLinks(tx, productId);
    const link = current.find((item) => item.id === colorId);
    if (!link) return fail(`That colour is no longer on this product. ${REFRESH}`);
    const ordered = moveInList(
      current.map((item) => item.id),
      colorId,
      direction,
    );
    if (!ordered) return fail(`${link.name} is already ${direction === "up" ? "first" : "last"}.`);

    await writeColorOrder(tx, productId, ordered, current);
    const position = ordered.indexOf(colorId) + 1;
    await recordAudit({
      tx,
      actorId,
      action: "product.color.move",
      entityType: "Product",
      entityId: productId,
      summary: `Moved ${link.name} to ${ordinal(position)} of ${ordered.length} colours of ${product.name}.`,
      metadata: { productId, colorId, order: ordered },
    });
    return {
      ok: true,
      data: null,
      message: `${link.name} is now ${ordinal(position)} of ${ordered.length} colours.`,
    };
  });
}

/* ── Sizes ──────────────────────────────────────────────────────────────── */

/**
 * Adds registry sizes to the product, each where it falls in size order. All of
 * a product's sizes come from one system, and a one-size product has one size.
 */
export async function addSizesToProduct(input: {
  productId: string;
  sizeIds: readonly string[];
  actorId: string;
}): Promise<Result> {
  const { productId, actorId } = input;
  const wanted = [...new Set(input.sizeIds)];
  if (wanted.length === 0) return fail("Choose at least one size.", { sizeId: "Choose at least one size." });

  return inTransaction(async (tx) => {
    const product = await lockProduct(tx, productId);
    if (!product) return fail(PRODUCT_GONE);

    const current = await sizeLinks(tx, productId);
    const fresh = wanted.filter((id) => !current.some((link) => link.id === id));
    if (fresh.length === 0) {
      return fail(wanted.length === 1 ? "That size is already on this product." : "Those sizes are already on this product.");
    }

    const found = await tx.size.findMany({
      where: { id: { in: fresh } },
      select: { id: true, label: true, system: true, code: true, sortOrder: true },
    });
    if (found.length !== fresh.length) return fail(`One of those sizes no longer exists. ${REFRESH}`);

    let ordered: OptionSize[] = current;
    for (const size of [...found].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const problem = sizeAddProblem(ordered, size);
      if (problem) return fail(problem, { sizeId: problem });
      ordered = insertSizeInOrder(ordered, size);
    }

    const freshIds = new Set(fresh);
    const order = ordered.map((size) => size.id);
    await tx.productSize.createMany({
      data: order.flatMap((sizeId, position) => (freshIds.has(sizeId) ? [{ productId, sizeId, position }] : [])),
    });
    await writeSizeOrder(
      tx,
      productId,
      order,
      current.concat(
        found.map((size) => ({ ...size, position: order.indexOf(size.id) })),
      ),
    );

    const labels = ordered.filter((size) => freshIds.has(size.id)).map((size) => size.label);
    await recordAudit({
      tx,
      actorId,
      action: "product.size.add",
      entityType: "Product",
      entityId: productId,
      summary: `Added size${labels.length === 1 ? "" : "s"} ${joinWords(labels)} to ${product.name}.`,
      metadata: { productId, sizeIds: fresh },
    });

    return {
      ok: true,
      data: null,
      message: `Added size${labels.length === 1 ? "" : "s"} ${joinWords(labels)} to ${product.name}. Next, create ${labels.length === 1 ? "its" : "their"} variants under “Variants and stock”.`,
    };
  });
}

/**
 * Creates a size in the registry — placed after `after` (a size of the same
 * system) or first — and adds it to the product, in one transaction.
 */
export async function createSizeForProduct(input: {
  productId: string;
  label: string;
  system: SizeSystem;
  code: string;
  after: string | null;
  actorId: string;
}): Promise<Result> {
  const { productId, system, actorId } = input;
  return inTransaction(
    async (tx) => {
      const product = await lockProduct(tx, productId);
      if (!product) return fail(PRODUCT_GONE);

      const current = await sizeLinks(tx, productId);
      const provisional: OptionSize = { id: "", label: input.label, system, code: input.code, sortOrder: 0 };
      const problem = sizeAddProblem(current, provisional);
      if (problem) {
        const existing = productSizeSystem(current);
        return fail(problem, existing !== null && existing !== system ? { system: problem } : undefined);
      }

      const created = await insertRegistrySize(tx, {
        label: input.label,
        system,
        code: input.code,
        after: input.after,
        actorId,
      });
      if (!created.ok) return fail(created.message, { [created.field]: created.message });
      const size = created.entry;

      // Registry positions moved to make room: re-read before placing the new size.
      const refreshed = await sizeLinks(tx, productId);
      const order = insertSizeInOrder(refreshed, { ...size, position: refreshed.length }).map((item) => item.id);
      await tx.productSize.create({ data: { productId, sizeId: size.id, position: order.indexOf(size.id) } });
      await writeSizeOrder(tx, productId, order, [...refreshed, { ...size, position: order.indexOf(size.id) }]);

      await recordAudit({
        tx,
        actorId,
        action: "product.size.add",
        entityType: "Product",
        entityId: productId,
        summary: `Added the new size ${size.label} to ${product.name}.`,
        metadata: { productId, sizeIds: [size.id], created: true },
      });

      return {
        ok: true,
        data: null,
        message: `Created size ${size.label} (${size.code}) in ${sizeSystemLabel(size.system).toLowerCase()} and added it to ${product.name}. Next, create its variants under “Variants and stock”.`,
      };
    },
    "A size with this label was added a moment ago. Refresh the page and choose it from the list.",
  );
}

/** Moves one of the product's sizes a place earlier ("up") or later ("down"). */
export async function moveProductSize(input: {
  productId: string;
  sizeId: string;
  direction: "up" | "down";
  actorId: string;
}): Promise<Result> {
  const { productId, sizeId, direction, actorId } = input;
  return inTransaction(async (tx) => {
    const product = await lockProduct(tx, productId);
    if (!product) return fail(PRODUCT_GONE);

    const current = await sizeLinks(tx, productId);
    const link = current.find((item) => item.id === sizeId);
    if (!link) return fail(`That size is no longer on this product. ${REFRESH}`);
    const ordered = moveInList(
      current.map((item) => item.id),
      sizeId,
      direction,
    );
    if (!ordered) return fail(`${link.label} is already ${direction === "up" ? "first" : "last"}.`);

    await writeSizeOrder(tx, productId, ordered, current);
    const position = ordered.indexOf(sizeId) + 1;
    await recordAudit({
      tx,
      actorId,
      action: "product.size.move",
      entityType: "Product",
      entityId: productId,
      summary: `Moved size ${link.label} to ${ordinal(position)} of ${ordered.length} sizes of ${product.name}.`,
      metadata: { productId, sizeId, order: ordered },
    });
    return { ok: true, data: null, message: `${link.label} is now ${ordinal(position)} of ${ordered.length} sizes.` };
  });
}

/* ── Removing a colour or size ──────────────────────────────────────────── */

/**
 * Takes a colour or size off the product, deleting its variants (and their stock
 * records and history) with it — only when none of them has ever been ordered or
 * has stock. Otherwise nothing changes and the message says why and what to do.
 */
export async function removeProductOption(input: {
  productId: string;
  kind: "color" | "size";
  optionId: string;
  actorId: string;
}): Promise<Result> {
  const { productId, kind, optionId, actorId } = input;
  return inTransaction(async (tx) => {
    const product = await lockProduct(tx, productId);
    if (!product) return fail(PRODUCT_GONE);

    const colors = kind === "color" ? await colorLinks(tx, productId) : [];
    const sizes = kind === "size" ? await sizeLinks(tx, productId) : [];
    const color = colors.find((link) => link.id === optionId);
    const size = sizes.find((link) => link.id === optionId);
    if (!color && !size) {
      return fail(`That ${kind === "color" ? "colour" : "size"} is no longer on this product. ${REFRESH}`);
    }
    // "Sand" either way; "Size M" to start a sentence, "size M" within one.
    const title = color ? color.name : `Size ${size?.label ?? optionId}`;
    const name = color ? color.name : `size ${size?.label ?? optionId}`;

    const condition = kind === "color" ? Prisma.sql`v."colorId" = ${optionId}` : Prisma.sql`v."sizeId" = ${optionId}`;
    await lockVariants(tx, productId, condition);
    const variants = await readVariantFacts(tx, productId, condition);
    const usage = optionUsage(variants);
    if (!canRemoveOption(usage)) {
      const problem = optionRemovalProblem(title, usage) ?? `${title} can’t be removed.`;
      return fail(`${problem} ${optionRemovalAdvice(kind === "color" ? "colour" : "size", name, usage)}`.trim());
    }

    if (variants.length > 0) {
      await tx.productVariant.deleteMany({ where: { productId, id: { in: variants.map((variant) => variant.id) } } });
    }

    let photos = 0;
    if (color) {
      await tx.productColor.delete({ where: { productId_colorId: { productId, colorId: optionId } } });
      const remaining = colors.filter((link) => link.id !== optionId);
      await writeColorOrder(tx, productId, remaining.map((link) => link.id), remaining);
      photos = await tx.productImage.count({ where: { productId, colorId: optionId } });
    } else {
      await tx.productSize.delete({ where: { productId_sizeId: { productId, sizeId: optionId } } });
      const remaining = sizes.filter((link) => link.id !== optionId);
      await writeSizeOrder(tx, productId, remaining.map((link) => link.id), remaining);
    }

    const skus = variants.map((variant) => variant.sku);
    const withVariants = variants.length > 0 ? `, with its ${variantCount(variants.length)}` : "";
    await recordAudit({
      tx,
      actorId,
      action: kind === "color" ? "product.color.remove" : "product.size.remove",
      entityType: "Product",
      entityId: productId,
      summary: `Removed ${color ? color.name : `size ${size?.label}`} from ${product.name}${withVariants}.`,
      metadata: { productId, [kind === "color" ? "colorId" : "sizeId"]: optionId, deletedSkus: skus.slice(0, 100) },
    });

    const photoNote =
      photos > 0
        ? ` ${photos === 1 ? "One photo is" : `${photos} photos are`} still set to ${color?.name} — change or remove ${photos === 1 ? "it" : "them"} under “Photos”.`
        : "";
    return {
      ok: true,
      data: null,
      message: `Removed ${color ? color.name : `size ${size?.label}`} from ${product.name}${withVariants}.${photoNote}`,
    };
  });
}

/* ── Creating variants ──────────────────────────────────────────────────── */

export interface NewVariantInput {
  colorId: string;
  sizeId: string;
  /** Opening stock on hand, 0 or more. */
  openingStock: number;
}

/**
 * Creates variants for colour and size combinations the product offers, each with
 * its SKU (lib/admin/sku), a stock record at its opening stock and an INITIAL
 * adjustment naming the admin — all in one transaction. Combinations that already
 * have a variant are skipped. A SKU already used by another variant (a code that
 * was reused) stops the whole batch with a message naming it.
 */
export async function createVariants(input: {
  productId: string;
  items: readonly NewVariantInput[];
  actorId: string;
}): Promise<Result<{ created: number }>> {
  const { productId, items, actorId } = input;
  if (items.length === 0) return fail("Tick at least one colour and size to create.");
  for (const item of items) {
    if (!Number.isSafeInteger(item.openingStock) || item.openingStock < 0 || item.openingStock > MAX_STOCK_CHANGE) {
      return fail("Opening stock must be a whole number from 0 up.");
    }
  }

  return inTransaction<{ created: number }>(
    async (tx) => {
      const product = await lockProduct(tx, productId);
      if (!product) return fail(PRODUCT_GONE);

      const colors = await colorLinks(tx, productId);
      const sizes = await sizeLinks(tx, productId);
      const colorById = new Map(colors.map((color) => [color.id, color]));
      const sizeById = new Map(sizes.map((size) => [size.id, size]));
      for (const item of items) {
        if (!colorById.has(item.colorId)) return fail(`A colour you ticked is no longer on this product. ${REFRESH}`);
        if (!sizeById.has(item.sizeId)) return fail(`A size you ticked is no longer on this product. ${REFRESH}`);
      }

      const codeProblem =
        skuPartProblem("category", product.categoryCode) ??
        skuPartProblem("product", product.code) ??
        items
          .map(
            (item) =>
              skuPartProblem("colour", colorById.get(item.colorId)?.code ?? "") ??
              skuPartProblem("size", sizeById.get(item.sizeId)?.code ?? ""),
          )
          .find(Boolean) ??
        null;
      if (codeProblem) return fail(`${codeProblem} Fix it before creating variants.`);

      const existing = await tx.productVariant.findMany({
        where: { productId },
        select: { colorId: true, sizeId: true },
      });
      const existingKeys = new Set(existing.map((variant) => comboKey(variant.colorId, variant.sizeId)));
      const seen = new Set<string>();
      const toCreate = items.filter((item) => {
        const key = comboKey(item.colorId, item.sizeId);
        if (existingKeys.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const skipped = items.length - toCreate.length;
      if (toCreate.length === 0) {
        return {
          ok: true,
          data: { created: 0 },
          message: "Those variants already exist, so nothing was changed.",
        };
      }

      const rows = toCreate.map((item) => {
        const color = colorById.get(item.colorId);
        const size = sizeById.get(item.sizeId);
        return {
          ...item,
          label: variantOptionLabel(color?.name ?? item.colorId, size?.label ?? item.sizeId),
          sku: buildVariantSku({
            categoryCode: product.categoryCode,
            productCode: product.code,
            colorCode: color?.code ?? "",
            sizeCode: size?.code ?? "",
          }),
        };
      });

      const clashes = await tx.productVariant.findMany({
        where: { sku: { in: rows.map((row) => row.sku) } },
        select: {
          sku: true,
          product: { select: { name: true } },
          color: { select: { name: true } },
          size: { select: { label: true } },
        },
        take: 3,
      });
      if (clashes.length > 0) {
        const clash = clashes[0];
        return fail(
          `The SKU ${clash.sku} is already used by ${clash.product.name} (${variantOptionLabel(clash.color.name, clash.size.label)}), so nothing was created. This happens when a category, product, colour or size code has been used twice. Give the product a different code, then try again.`,
        );
      }

      const created = await tx.productVariant.createManyAndReturn({
        data: rows.map((row) => ({ productId, colorId: row.colorId, sizeId: row.sizeId, sku: row.sku, isActive: true })),
        select: { id: true, sku: true },
      });
      if (created.length !== rows.length) {
        throw new Rollback(fail(`Some of these variants couldn’t be created. ${REFRESH}`));
      }
      const stockBySku = new Map(rows.map((row) => [row.sku, row.openingStock]));

      await tx.inventory.createMany({
        data: created.map((variant) => ({
          variantId: variant.id,
          onHand: stockBySku.get(variant.sku) ?? 0,
          reserved: 0,
          lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
        })),
      });
      await tx.inventoryAdjustment.createMany({
        data: created.map((variant) => {
          const stock = stockBySku.get(variant.sku) ?? 0;
          return {
            variantId: variant.id,
            onHandDelta: stock,
            reservedDelta: 0,
            reason: "INITIAL" as const,
            note: stock > 0 ? "Opening stock, entered when the variant was created." : "Created with no stock.",
            actorId,
          };
        }),
      });

      const totalStock = rows.reduce((sum, row) => sum + row.openingStock, 0);
      const stockWords = totalStock > 0 ? ` with ${pieces(totalStock)} of opening stock` : " with no stock yet";
      await recordAudit({
        tx,
        actorId,
        action: "product.variants.create",
        entityType: "Product",
        entityId: productId,
        summary: `Created ${variantCount(rows.length)} of ${product.name}${stockWords}.`,
        metadata: {
          productId,
          variants: rows.slice(0, 100).map((row) => ({ sku: row.sku, openingStock: row.openingStock })),
        },
      });

      return {
        ok: true,
        data: { created: rows.length },
        message:
          `Created ${variantCount(rows.length)}${stockWords}.${saleWords(product.status, totalStock > 0)}` +
          (skipped > 0 ? ` ${skipped === 1 ? "One already existed" : `${skipped} already existed`} and ${skipped === 1 ? "was" : "were"} left as ${skipped === 1 ? "it was" : "they were"}.` : ""),
      };
    },
    "Some of these variants were created by someone else at the same moment. Refresh the page to see them.",
  );
}

/* ── One variant ────────────────────────────────────────────────────────── */

/** Switches a variant on (can be bought when it has stock) or off (hidden from purchase, kept for order history). */
export async function setVariantActive(input: {
  productId: string;
  variantId: string;
  isActive: boolean;
  actorId: string;
}): Promise<Result<{ isActive: boolean }>> {
  const { productId, variantId, isActive, actorId } = input;
  return inTransaction<{ isActive: boolean }>(async (tx) => {
    const product = await lockProduct(tx, productId);
    if (!product) return fail(PRODUCT_GONE);

    const updated = await tx.productVariant.updateMany({
      where: { id: variantId, productId, isActive: !isActive },
      data: { isActive },
    });
    const variant = await tx.productVariant.findFirst({
      where: { id: variantId, productId },
      select: {
        sku: true,
        color: { select: { name: true } },
        size: { select: { label: true } },
        inventory: { select: { onHand: true, reserved: true } },
      },
    });
    if (!variant) return fail(VARIANT_GONE);
    const label = variantOptionLabel(variant.color.name, variant.size.label);

    if (updated.count === 0) {
      return {
        ok: true,
        data: { isActive },
        message: `${label} was already switched ${isActive ? "on" : "off"}.`,
      };
    }

    await recordAudit({
      tx,
      actorId,
      action: isActive ? "product.variant.activate" : "product.variant.deactivate",
      entityType: "Product",
      entityId: productId,
      summary: `Switched ${isActive ? "on" : "off"} ${variant.sku} (${label}) of ${product.name}.`,
      metadata: { productId, variantId, sku: variant.sku, isActive },
    });

    let message: string;
    if (!isActive) {
      message = `Switched off ${label}. Customers can no longer buy it; past orders aren’t affected.`;
    } else {
      const available = Math.max(0, (variant.inventory?.onHand ?? 0) - (variant.inventory?.reserved ?? 0));
      message =
        product.status === "ACTIVE"
          ? available > 0
            ? `Switched on ${label}. It’s for sale again.`
            : `Switched on ${label}. It has nothing available to sell, so it shows as sold out until you add stock.`
          : `Switched on ${label}. It goes on sale when the product is live.`;
    }
    return { ok: true, data: { isActive }, message };
  });
}

/** Switches every variant of one of the product's colours or sizes on or off. */
export async function setOptionVariantsActive(input: {
  productId: string;
  kind: "color" | "size";
  optionId: string;
  isActive: boolean;
  actorId: string;
}): Promise<Result<{ changed: number }>> {
  const { productId, kind, optionId, isActive, actorId } = input;
  return inTransaction<{ changed: number }>(async (tx) => {
    const product = await lockProduct(tx, productId);
    if (!product) return fail(PRODUCT_GONE);

    let option: { name: string } | null;
    if (kind === "color") {
      option = await tx.color.findUnique({ where: { id: optionId }, select: { name: true } });
    } else {
      const size = await tx.size.findUnique({ where: { id: optionId }, select: { label: true } });
      option = size ? { name: `size ${size.label}` } : null;
    }
    if (!option) return fail(`That ${kind === "color" ? "colour" : "size"} no longer exists. ${REFRESH}`);

    const updated = await tx.productVariant.updateMany({
      where: {
        productId,
        isActive: !isActive,
        ...(kind === "color" ? { colorId: optionId } : { sizeId: optionId }),
      },
      data: { isActive },
    });
    if (updated.count === 0) {
      return {
        ok: true,
        data: { changed: 0 },
        message: `The variants of ${option.name} were already switched ${isActive ? "on" : "off"}.`,
      };
    }

    await recordAudit({
      tx,
      actorId,
      action: isActive ? "product.variants.activate" : "product.variants.deactivate",
      entityType: "Product",
      entityId: productId,
      summary: `Switched ${isActive ? "on" : "off"} ${variantCount(updated.count)} of ${option.name} for ${product.name}.`,
      metadata: { productId, kind, optionId, isActive, changed: updated.count },
    });

    return {
      ok: true,
      data: { changed: updated.count },
      message: isActive
        ? `Switched on ${variantCount(updated.count)} of ${option.name}.${product.status === "ACTIVE" ? " Those with stock are for sale again." : ""}`
        : `Switched off ${variantCount(updated.count)} of ${option.name}. Customers can no longer buy ${option.name}; past orders aren’t affected.`,
    };
  });
}

/** Sets a variant's own price in kobo, or null to use the product price. */
export async function setVariantPrice(input: {
  productId: string;
  variantId: string;
  priceOverride: number | null;
  actorId: string;
}): Promise<Result<{ priceOverride: number | null }>> {
  const { productId, variantId, priceOverride, actorId } = input;
  return inTransaction<{ priceOverride: number | null }>(async (tx) => {
    const product = await lockProduct(tx, productId);
    if (!product) return fail(PRODUCT_GONE);

    const variant = await tx.productVariant.findFirst({
      where: { id: variantId, productId },
      select: { sku: true, priceOverride: true, color: { select: { name: true } }, size: { select: { label: true } } },
    });
    if (!variant) return fail(VARIANT_GONE);
    const label = variantOptionLabel(variant.color.name, variant.size.label);
    const productPrice = `the product price (${formatKobo(product.price)})`;
    const describe = (value: number | null) => (value === null ? productPrice : formatKobo(value));

    if (variant.priceOverride === priceOverride) {
      return { ok: true, data: { priceOverride }, message: `${label} already uses ${describe(priceOverride)}.` };
    }

    await tx.productVariant.update({ where: { id: variantId }, data: { priceOverride } });
    await recordAudit({
      tx,
      actorId,
      action: "product.variant.price",
      entityType: "Product",
      entityId: productId,
      summary: `Changed the price of ${variant.sku} (${label}) from ${describe(variant.priceOverride)} to ${describe(priceOverride)}.`,
      metadata: { productId, variantId, sku: variant.sku, before: variant.priceOverride, after: priceOverride },
    });

    return {
      ok: true,
      data: { priceOverride },
      message:
        priceOverride === null
          ? `${label} now uses ${productPrice}.`
          : `${label} now costs ${formatKobo(priceOverride)}, whatever the product price.`,
    };
  });
}

/**
 * Deletes a variant that has never been ordered and has no stock, with its stock
 * record and history. Otherwise nothing changes and the message says why.
 */
export async function deleteVariant(input: {
  productId: string;
  variantId: string;
  actorId: string;
}): Promise<Result> {
  const { productId, variantId, actorId } = input;
  return inTransaction(async (tx) => {
    const product = await lockProduct(tx, productId);
    if (!product) return fail(PRODUCT_GONE);

    const condition = Prisma.sql`v."id" = ${variantId}`;
    await lockVariants(tx, productId, condition);
    const [variant] = await readVariantFacts(tx, productId, condition);
    if (!variant) return fail(VARIANT_GONE);

    if (variantDeleteBlock(variant)) return fail(variantDeleteBlockedMessage(variant));

    await tx.productVariant.delete({ where: { id: variantId } });
    const label = variantOptionLabel(variant.colorName, variant.sizeLabel);
    await recordAudit({
      tx,
      actorId,
      action: "product.variant.remove",
      entityType: "Product",
      entityId: productId,
      summary: `Deleted the variant ${variant.sku} (${label}) of ${product.name}.`,
      metadata: { productId, variantId, sku: variant.sku },
    });

    return {
      ok: true,
      data: null,
      message: `Deleted ${label} (${variant.sku}). You can create it again at any time.`,
    };
  });
}

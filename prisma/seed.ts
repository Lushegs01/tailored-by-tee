/**
 * Seeds PostgreSQL with the typed demo catalogue (src/lib/catalog/seed) — the
 * same records, ids and photography the storefront shows without a database.
 *
 * Idempotent: content is upserted on every run, but stock is only written when a
 * variant is first created, so re-seeding a trading store never resets inventory.
 *
 *   npm run db:seed        (after `npm run db:migrate`)
 */
import { readFileSync } from "node:fs";

import nextEnv from "@next/env";
import { PrismaNeon } from "@prisma/adapter-neon";

import { siteConfig } from "../src/config/site";
import { PrismaClient } from "../src/generated/prisma/client";
import type {
  ProductBadge as DbProductBadge,
  ProductImageRole as DbProductImageRole,
  ProductStatus as DbProductStatus,
  SizeSystem as DbSizeSystem,
} from "../src/generated/prisma/enums";
import { toDbEnum } from "../src/lib/catalog/db-enums";
import { buildProduct, categoryId, collectionId } from "../src/lib/catalog/mappers";
import { CATEGORY_SEEDS } from "../src/lib/catalog/seed/categories";
import { COLLECTION_SEEDS } from "../src/lib/catalog/seed/collections";
import { COLORS, colorSkuCode, type ColorId } from "../src/lib/catalog/seed/colors";
import { PRODUCT_SEEDS } from "../src/lib/catalog/seed/products";
import { SIZES, sizeSkuCode, type SizeId } from "../src/lib/catalog/seed/sizes";
import type { MediaAsset, MediaManifest } from "../src/lib/media/types";

// @next/env is CommonJS without named-export hints, so it is read from the default export.
nextEnv.loadEnvConfig(process.cwd());

const manifest = JSON.parse(
  readFileSync(new URL("../src/data/media.json", import.meta.url), "utf8"),
) as MediaManifest;

/* ── Media ─────────────────────────────────────────────────────────────── */

function assetFor(key: string): MediaAsset | null {
  const [namespace, id] = key.split(":");
  const bucket = namespace === "editorial" ? manifest.editorial : manifest.categories;
  return bucket[id] ?? null;
}

/** "editorial:hero" → "med_editorial_hero": stable, so re-runs update rather than duplicate. */
const mediaIdFor = (key: string) => `med_${key.replace(":", "_")}`;

async function upsertMedia(db: PrismaClient, id: string, asset: MediaAsset): Promise<string> {
  const data = {
    url: asset.src,
    width: asset.width,
    height: asset.height,
    alt: asset.alt,
    color: asset.color,
    blurDataUrl: asset.blurDataURL ?? null,
    provider: "unsplash",
    creditName: asset.credit?.name ?? null,
    creditUrl: asset.credit?.url ?? null,
  };
  await db.media.upsert({ where: { id }, create: { id, ...data }, update: data });
  return id;
}

/* ── Reference data ────────────────────────────────────────────────────── */

async function seedReferenceData(db: PrismaClient) {
  for (const [index, color] of COLORS.entries()) {
    const data = { name: color.name, hex: color.hex, code: colorSkuCode(color.id as ColorId), sortOrder: index };
    await db.color.upsert({ where: { id: color.id }, create: { id: color.id, ...data }, update: data });
  }

  for (const size of SIZES) {
    const data = {
      label: size.label,
      system: toDbEnum<DbSizeSystem>(size.system),
      code: sizeSkuCode(size.id as SizeId),
      sortOrder: size.sortOrder,
    };
    await db.size.upsert({ where: { id: size.id }, create: { id: size.id, ...data }, update: data });
  }
}

async function seedCategoriesAndCollections(db: PrismaClient) {
  for (const [index, seed] of CATEGORY_SEEDS.entries()) {
    const id = categoryId(seed.slug);
    const asset = assetFor(`category:${seed.slug}`);
    const imageId = asset ? await upsertMedia(db, mediaIdFor(`category:${seed.slug}`), asset) : null;
    const data = {
      slug: seed.slug,
      name: seed.name,
      description: seed.description,
      code: seed.code,
      imageId,
      sortOrder: index,
    };
    await db.category.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  for (const [index, seed] of COLLECTION_SEEDS.entries()) {
    const id = collectionId(seed.slug);

    const imageIds: string[] = [];
    for (const key of seed.imageKeys) {
      const asset = assetFor(key);
      if (asset) imageIds.push(await upsertMedia(db, mediaIdFor(key), asset));
    }
    const heroKey = seed.heroImageKey;
    const heroAsset = heroKey ? assetFor(heroKey) : null;
    const heroImageId = heroKey && heroAsset ? await upsertMedia(db, mediaIdFor(heroKey), heroAsset) : null;

    const data = {
      slug: seed.slug,
      name: seed.name,
      code: seed.code,
      season: seed.season,
      summary: seed.summary,
      description: seed.description,
      heroImageId,
      sortOrder: index,
      isFeatured: seed.isFeatured,
    };
    await db.$transaction([
      db.collection.upsert({ where: { id }, create: { id, ...data }, update: data }),
      db.collectionImage.deleteMany({ where: { collectionId: id } }),
      db.collectionImage.createMany({
        data: imageIds.map((mediaId, position) => ({ collectionId: id, mediaId, position })),
      }),
    ]);
  }
}

/* ── Products ──────────────────────────────────────────────────────────── */

async function seedProducts(db: PrismaClient): Promise<{ products: number; newVariants: number }> {
  const categoryCodes = new Map<string, string>(CATEGORY_SEEDS.map((seed) => [seed.slug, seed.code]));
  let newVariants = 0;

  for (const seed of PRODUCT_SEEDS) {
    const media = manifest.products[seed.slug] ?? null;
    const product = buildProduct(seed, {
      categoryCode: categoryCodes.get(seed.category) ?? "GEN",
      media,
      lowStockThreshold: siteConfig.commerce.defaultLowStockThreshold,
    });

    // Photography first: shared rows, idempotent, and kept out of the product transaction.
    const images: { id: string; mediaId: string; role: string; colorId: string | null; position: number }[] = [];
    for (const image of product.images) {
      const source = image.role === "primary" ? media?.primary : media?.alternate;
      const mediaId = await upsertMedia(db, `med_${image.id}`, source ?? image);
      images.push({ id: image.id, mediaId, role: image.role, colorId: image.colorId, position: image.position });
    }

    const data = {
      slug: product.slug,
      code: seed.code,
      name: product.name,
      summary: product.summary,
      description: product.description,
      details: product.details,
      material: product.material,
      care: product.care,
      fit: product.fit,
      modelNote: product.modelNote,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      categoryId: product.categoryId,
      tags: product.tags,
      badge: product.badge ? toDbEnum<DbProductBadge>(product.badge) : null,
      status: toDbEnum<DbProductStatus>(product.status),
      isFeatured: product.isFeatured,
      bestsellerRank: product.bestsellerRank,
      seoTitle: product.seo.title,
      seoDescription: product.seo.description,
    };

    newVariants += await db.$transaction(
      async (tx) => {
        const productId = product.id;
        await tx.product.upsert({
          where: { id: productId },
          create: { id: productId, ...data, createdAt: new Date(product.createdAt) },
          update: data,
        });

        // Ordered links are content: replaced wholesale on every run.
        await tx.productColor.deleteMany({ where: { productId } });
        await tx.productColor.createMany({
          data: product.colorIds.map((colorId, position) => ({ productId, colorId, position })),
        });
        await tx.productSize.deleteMany({ where: { productId } });
        await tx.productSize.createMany({
          data: product.sizeIds.map((sizeId, position) => ({ productId, sizeId, position })),
        });
        await tx.productCollection.deleteMany({ where: { productId } });
        await tx.productCollection.createMany({
          data: product.collectionIds.map((id, position) => ({ productId, collectionId: id, position })),
        });
        await tx.productImage.deleteMany({ where: { productId } });
        await tx.productImage.createMany({
          data: images.map((image) => ({
            id: image.id,
            productId,
            mediaId: image.mediaId,
            role: toDbEnum<DbProductImageRole>(image.role),
            colorId: image.colorId,
            position: image.position,
          })),
        });

        let created = 0;
        for (const variant of product.variants) {
          const variantData = {
            sku: variant.sku,
            colorId: variant.colorId,
            sizeId: variant.sizeId,
            priceOverride: variant.priceOverride,
            isActive: variant.isActive,
          };
          await tx.productVariant.upsert({
            where: { id: variant.id },
            create: { id: variant.id, productId, ...variantData },
            update: variantData,
          });

          const existing = await tx.inventory.findUnique({
            where: { variantId: variant.id },
            select: { variantId: true },
          });
          if (existing) continue;

          // Seeded "reserved" units stand for checkouts that don't exist here, so none are held.
          await tx.inventory.create({
            data: {
              variantId: variant.id,
              onHand: variant.inventory.onHand,
              reserved: 0,
              lowStockThreshold: variant.inventory.lowStockThreshold,
            },
          });
          await tx.inventoryAdjustment.create({
            data: {
              variantId: variant.id,
              onHandDelta: variant.inventory.onHand,
              reason: "INITIAL",
              note: "Demo stock from the seed catalogue",
            },
          });
          created++;
        }
        return created;
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    console.log(`  ✓ ${product.name}`);
  }

  return { products: PRODUCT_SEEDS.length, newVariants };
}

/* ── Run ───────────────────────────────────────────────────────────────── */

async function main() {
  // Prefer the direct connection for bulk writes; the pooled one works too.
  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Set DATABASE_URL_UNPOOLED (or DATABASE_URL) in .env.local before seeding — see .env.example.");
  }

  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  try {
    console.log("Seeding reference data…");
    await seedReferenceData(db);
    console.log("Seeding categories and collections…");
    await seedCategoriesAndCollections(db);
    console.log("Seeding products…");
    const { products, newVariants } = await seedProducts(db);
    console.log(`Done: ${products} products; stock created for ${newVariants} new variants (existing stock untouched).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

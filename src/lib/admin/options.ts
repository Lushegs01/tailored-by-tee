import "server-only";

import {
  colorIdFromName,
  sizeIdFor,
  sizeSystemLabel,
  type OptionColor,
  type OptionSize,
  type RegistryColor,
  type RegistrySize,
} from "@/components/admin/products/variants/variant-rules";
import type { Prisma } from "@/generated/prisma/client";
import type { SizeSystem } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";

import { recordAudit } from "./audit";
import { normaliseSkuCode } from "./sku";

/*
 * The shared colour and size registries (Color, Size): one "Stone" across the
 * catalogue keeps the shop's filters honest, and each entry's code is its part
 * of every SKU made with it.
 *
 * Entries are only ever added here, never renamed or recoded: their codes are
 * printed in SKUs on labels and orders, and their names are shared by every
 * product using them. Adding happens inside the caller's transaction (which
 * also puts the new entry on a product), with its own audit entry.
 *
 * Uniqueness: a colour's id (the slug of its name) and code are unique in the
 * database, so two admins adding "Sand" at once can't both succeed — the loser's
 * transaction fails with a unique-constraint error the caller turns into a
 * message. A size's code has no database constraint (codes only need to differ
 * between sizes a product can combine), so new sizes are added one at a time
 * under an advisory lock and checked against every existing code.
 */

type Tx = Prisma.TransactionClient;

/** Any number unique to this lock; held until the transaction ends. */
const SIZE_REGISTRY_LOCK = 742_091_530;

/* ── Reading ────────────────────────────────────────────────────────────── */

/** Every colour, in registry order, with how many products use it. */
export async function listColorRegistry(): Promise<RegistryColor[]> {
  const colors = await getDb().color.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, hex: true, code: true, _count: { select: { products: true } } },
  });
  return colors.map((color) => ({
    id: color.id,
    name: color.name,
    hex: color.hex,
    code: color.code,
    productCount: color._count.products,
  }));
}

/** Every size, in registry order (smallest first within each system), with how many products use it. */
export async function listSizeRegistry(): Promise<RegistrySize[]> {
  const sizes = await getDb().size.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: {
      id: true,
      label: true,
      system: true,
      code: true,
      sortOrder: true,
      _count: { select: { products: true } },
    },
  });
  return sizes.map((size) => ({
    id: size.id,
    label: size.label,
    system: size.system,
    code: size.code,
    sortOrder: size.sortOrder,
    productCount: size._count.products,
  }));
}

/* ── Adding ─────────────────────────────────────────────────────────────── */

export type RegistryInsertResult<T> =
  | { ok: true; entry: T }
  | { ok: false; field: string; message: string };

/**
 * Adds a colour to the registry inside `tx`, with its audit entry. `name`, `hex`
 * ("#RRGGBB") and `code` (three letters) must already be validated; this checks
 * they don't clash with an existing colour (same slug, same name in any case, or
 * same code).
 */
export async function insertRegistryColor(
  tx: Tx,
  input: { name: string; hex: string; code: string; actorId: string },
): Promise<RegistryInsertResult<OptionColor>> {
  const name = input.name.trim();
  const code = normaliseSkuCode(input.code);
  const id = colorIdFromName(name);
  if (!id) return { ok: false, field: "name", message: "Use letters or numbers in the name." };

  const clash = await tx.color.findFirst({
    where: { OR: [{ id }, { code }, { name: { equals: name, mode: "insensitive" } }] },
    select: { id: true, name: true, code: true },
  });
  if (clash) {
    if (clash.code === code && clash.id !== id && clash.name.toLowerCase() !== name.toLowerCase()) {
      return { ok: false, field: "code", message: `${code} is already the code for ${clash.name}. Choose another.` };
    }
    return {
      ok: false,
      field: "name",
      message: `There’s already a colour called ${clash.name}. Choose it from your colours instead.`,
    };
  }

  const last = await tx.color.aggregate({ _max: { sortOrder: true } });
  const color = await tx.color.create({
    data: { id, name, hex: input.hex, code, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    select: { id: true, name: true, hex: true, code: true },
  });

  await recordAudit({
    tx,
    actorId: input.actorId,
    action: "color.create",
    entityType: "Color",
    entityId: color.id,
    summary: `Created the colour ${color.name} (${color.code}, ${color.hex}).`,
    metadata: { id: color.id, name: color.name, hex: color.hex, code: color.code },
  });

  return { ok: true, entry: color };
}

/**
 * Adds a size to the registry inside `tx`, with its audit entry. `after` is the
 * id of the size (in the same system) it follows in size order, or null to put
 * it first. Later sizes move down one place to make room. `label` and `code`
 * must already be validated; this checks the label is new within its system and
 * the code is new anywhere.
 */
export async function insertRegistrySize(
  tx: Tx,
  input: { label: string; system: SizeSystem; code: string; after: string | null; actorId: string },
): Promise<RegistryInsertResult<OptionSize>> {
  const label = input.label.trim();
  const code = normaliseSkuCode(input.code);
  const { system } = input;
  const baseId = sizeIdFor(system, label);
  if (!baseId) return { ok: false, field: "label", message: "Use letters or numbers in the size." };

  // One new size at a time: the code check and the reordering below need a still registry.
  await tx.$queryRaw`SELECT 1 AS "locked" FROM (SELECT pg_advisory_xact_lock(${SIZE_REGISTRY_LOCK}::bigint)) AS "registry"`;

  const sameSystem = await tx.size.findMany({
    where: { system },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { id: true, label: true, sortOrder: true },
  });
  const sameLabel = sameSystem.find((size) => size.label.toLowerCase() === label.toLowerCase());
  if (sameLabel) {
    return {
      ok: false,
      field: "label",
      message: `${sameLabel.label} is already in ${sizeSystemLabel(system).toLowerCase()}. Choose it from the list instead.`,
    };
  }

  const codeClash = await tx.size.findFirst({
    where: { code: { equals: code, mode: "insensitive" } },
    select: { label: true, system: true },
  });
  if (codeClash) {
    return {
      ok: false,
      field: "code",
      message: `${code} is already the code for ${codeClash.label} (${sizeSystemLabel(codeClash.system).toLowerCase()}). Choose another.`,
    };
  }

  let sortOrder: number;
  if (input.after) {
    const anchor = sameSystem.find((size) => size.id === input.after);
    if (!anchor) {
      return {
        ok: false,
        field: "after",
        message: "That size is no longer in the list. Choose where the new size goes again.",
      };
    }
    sortOrder = anchor.sortOrder + 1;
  } else if (sameSystem.length > 0) {
    sortOrder = sameSystem[0].sortOrder;
  } else {
    const last = await tx.size.aggregate({ _max: { sortOrder: true } });
    sortOrder = (last._max.sortOrder ?? 0) + 1;
  }
  await tx.size.updateMany({ where: { sortOrder: { gte: sortOrder } }, data: { sortOrder: { increment: 1 } } });

  const taken = new Set(
    (
      await tx.size.findMany({ where: { id: { startsWith: baseId } }, select: { id: true } })
    ).map((size) => size.id),
  );
  let id = baseId;
  for (let suffix = 2; taken.has(id); suffix++) id = `${baseId}-${suffix}`;

  const size = await tx.size.create({
    data: { id, label, system, code, sortOrder },
    select: { id: true, label: true, system: true, code: true, sortOrder: true },
  });

  await recordAudit({
    tx,
    actorId: input.actorId,
    action: "size.create",
    entityType: "Size",
    entityId: size.id,
    summary: `Created the size ${size.label} (${sizeSystemLabel(size.system).toLowerCase()}, code ${size.code}).`,
    metadata: { id: size.id, label: size.label, system: size.system, code: size.code, sortOrder: size.sortOrder },
  });

  return { ok: true, entry: size };
}

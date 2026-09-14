import "server-only";

import { isDatabaseConfigured } from "@/lib/db";

import type { InventoryLevel } from "../types";
import { getLiveInventory, loadDatabaseCatalog } from "./database";
import { loadSeedCatalog } from "./seed";
import type { CatalogSnapshot, CatalogSource } from "./types";

export type { CatalogSnapshot, CatalogSource } from "./types";

/**
 * Where the catalogue comes from. `CATALOG_SOURCE` decides when set; otherwise the
 * database is used whenever DATABASE_URL is present, and the typed seed catalogue
 * when it isn't (local development without a database, preview builds).
 */
export function getCatalogSource(): CatalogSource {
  const configured = process.env.CATALOG_SOURCE;
  if (configured === "seed" || configured === "database") return configured;
  return isDatabaseConfigured() ? "database" : "seed";
}

export async function loadCatalog(): Promise<CatalogSnapshot> {
  return getCatalogSource() === "database" ? loadDatabaseCatalog() : loadSeedCatalog();
}

/**
 * Live stock for the given variants, or null when stock comes with the catalogue
 * (seed mode, where nothing is ever sold).
 */
export async function loadLiveInventory(variantIds: readonly string[]): Promise<Map<string, InventoryLevel> | null> {
  return getCatalogSource() === "database" ? getLiveInventory(variantIds) : null;
}

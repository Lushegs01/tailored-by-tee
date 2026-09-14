import type { Collection } from "@/lib/catalog/types";

/** "Collection 04 · Harmattan 2026" — empty for evergreen collections without either. */
export function collectionMeta(collection: Pick<Collection, "code" | "season">): string {
  return [collection.code, collection.season].filter(Boolean).join(" · ");
}

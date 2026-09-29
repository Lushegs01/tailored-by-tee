/* Shared wording for the photo picker and the product photos section. */

export const ALT_TEXT_LABEL = "Description (alt text)";

export const ALT_TEXT_HINT =
  "What the photo shows, for customers using screen readers and for search engines, e.g. “Model in the sand linen shirt, front view”.";

export const MEDIA_SOURCE_LABELS = {
  upload: "Uploaded",
  unsplash: "Unsplash",
  web: "Web address",
} as const;

export function describeUsageShort(usage: {
  products: number;
  categories: number;
  collections: number;
  total: number;
}): string {
  if (usage.total === 0) return "Not used";
  const parts: string[] = [];
  if (usage.products) parts.push(`${usage.products} product${usage.products === 1 ? "" : "s"}`);
  if (usage.categories) parts.push(`${usage.categories} categor${usage.categories === 1 ? "y" : "ies"}`);
  if (usage.collections) parts.push(`${usage.collections} collection${usage.collections === 1 ? "" : "s"}`);
  return `Used on ${parts.join(", ")}`;
}

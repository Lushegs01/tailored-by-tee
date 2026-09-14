import "server-only";

import { redirect } from "next/navigation";

import { listingHref, type ListingParams } from "@/lib/catalog/listing-params";
import { getCategorySummaries, listProducts } from "@/lib/catalog/repository";
import type { ProductListResult } from "@/lib/catalog/types";
import { VIRTUAL_CATEGORIES } from "@/lib/catalog/virtual-categories";

import type { CategoryNavItem } from "./types";

/**
 * "All pieces", new arrivals, every category with stock, then sale — with counts.
 * Empty entries are left out so the navigation never leads to a dead end.
 */
export async function getCategoryNav(currentPath: string): Promise<CategoryNavItem[]> {
  const [summaries, all, newest, sale] = await Promise.all([
    getCategorySummaries(),
    listProducts({ pageSize: 1 }),
    listProducts({ category: "new-arrivals", pageSize: 1 }),
    listProducts({ category: "sale", pageSize: 1 }),
  ]);

  const items = [
    { key: "all", name: "All pieces", href: "/shop", count: all.total },
    {
      key: "new-arrivals",
      name: VIRTUAL_CATEGORIES["new-arrivals"].name,
      href: "/shop/new-arrivals",
      count: newest.total,
    },
    ...summaries.map((category) => ({
      key: category.slug,
      name: category.name,
      href: `/shop/${category.slug}`,
      count: category.productCount,
    })),
    { key: "sale", name: VIRTUAL_CATEGORIES.sale.name, href: "/shop/sale", count: sale.total },
  ];

  return items.filter((item) => item.count > 0).map((item) => ({ ...item, current: item.href === currentPath }));
}

/** A page number past the end (an old link, a shrunk category) goes to the last real page. */
export function ensurePageInRange(basePath: string, params: ListingParams, result: ProductListResult) {
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  if (params.page > lastPage) redirect(listingHref(basePath, { ...params, page: lastPage }));
}

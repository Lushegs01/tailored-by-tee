/*
 * Arrow-key movement between search items. Every navigable element in the
 * overlay body carries `data-search-item`; DOM order is the visual order.
 */

export const SEARCH_ITEM_ATTR = "data-search-item";

export function getSearchItems(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(`[${SEARCH_ITEM_ATTR}]`));
}

export function focusFirstSearchItem(container: HTMLElement | null): boolean {
  const [first] = getSearchItems(container);
  first?.focus();
  return Boolean(first);
}

/**
 * Handles ArrowUp/ArrowDown/Home/End on a focused item. Returns "exit-top" when
 * focus should go back to the input (ArrowUp on the first item), otherwise
 * whether the key was handled.
 */
export function moveSearchFocus(
  container: HTMLElement | null,
  current: HTMLElement,
  key: string,
): "handled" | "exit-top" | "ignored" {
  const items = getSearchItems(container);
  const index = items.indexOf(current);
  if (index === -1) return "ignored";

  let next: HTMLElement | undefined;
  switch (key) {
    case "ArrowDown":
      next = items[Math.min(index + 1, items.length - 1)];
      break;
    case "ArrowUp":
      if (index === 0) return "exit-top";
      next = items[index - 1];
      break;
    case "Home":
      next = items[0];
      break;
    case "End":
      next = items[items.length - 1];
      break;
    default:
      return "ignored";
  }

  next?.focus();
  return "handled";
}

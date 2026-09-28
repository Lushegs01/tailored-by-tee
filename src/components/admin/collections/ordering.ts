/*
 * Ordering rules shared by the collections list, the categories list, the pieces
 * in a collection and a collection's photos. Pure: the server computes the new
 * order from what's in the database (never from what the browser saw), then
 * saves every position as 0, 1, 2… so gaps and ties from older data disappear.
 */

export type MoveDirection = "up" | "down";

export const MOVE_DIRECTIONS = ["up", "down"] as const satisfies readonly MoveDirection[];

/** The value of a position select meaning "put it first". */
export const PLACE_FIRST = "__first";

/**
 * `ids` with `id` swapped with its neighbour, or null when it can't move that way
 * (already first or last) or isn't in the list.
 */
export function moveInOrder(ids: readonly string[], id: string, direction: MoveDirection): string[] | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * `ids` with `id` placed straight after `afterId` (or first for PLACE_FIRST).
 * `id` is added when it isn't in the list yet (a new item). When `afterId` is no
 * longer in the list, the item keeps its place (or goes last when new).
 */
export function placeAfter(ids: readonly string[], id: string, afterId: string): string[] {
  const existing = ids.indexOf(id);
  const others = ids.filter((other) => other !== id);
  if (afterId === id) return [...ids];
  if (afterId === PLACE_FIRST) return [id, ...others];
  const anchor = others.indexOf(afterId);
  if (anchor === -1) return existing === -1 ? [...others, id] : [...ids];
  return [...others.slice(0, anchor + 1), id, ...others.slice(anchor + 1)];
}

/** The PLACE_FIRST / id value describing where `id` currently sits (what comes before it). */
export function currentPlaceAfter(ids: readonly string[], id: string): string {
  const index = ids.indexOf(id);
  if (index <= 0) return PLACE_FIRST;
  return ids[index - 1];
}

/** Which rows need a new position: [id, newPosition] for each whose stored position differs. */
export function changedPositions(
  ordered: readonly string[],
  current: ReadonlyMap<string, number>,
): [id: string, position: number][] {
  const changes: [string, number][] = [];
  ordered.forEach((id, position) => {
    if (current.get(id) !== position) changes.push([id, position]);
  });
  return changes;
}

export interface PositionOption {
  value: string;
  label: string;
}

/**
 * Options for a "Position" select: First, then "After <name>" for every other
 * item in order. `others` excludes the item being edited.
 */
export function positionOptions(others: readonly { id: string; name: string }[]): PositionOption[] {
  return [
    { value: PLACE_FIRST, label: others.length > 0 ? `First (before ${others[0].name})` : "First" },
    ...others.map((other, index) => ({
      value: other.id,
      label: index === others.length - 1 ? `Last (after ${other.name})` : `After ${other.name}`,
    })),
  ];
}

import { formatNumber } from "@/lib/admin/format";

/** "1 order", "12 orders", "1,204 pieces". */
export function countNoun(count: number, one: string, other = `${one}s`): string {
  return `${formatNumber(count)} ${count === 1 ? one : other}`;
}

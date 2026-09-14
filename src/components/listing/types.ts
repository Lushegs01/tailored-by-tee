/** One entry in the category navigation beside (or above) a listing. */
export interface CategoryNavItem {
  key: string;
  name: string;
  href: string;
  count: number;
  current: boolean;
}

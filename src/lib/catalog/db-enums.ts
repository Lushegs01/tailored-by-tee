/*
 * Prisma enums are SCREAMING_SNAKE ("ONE_SIZE", "ONLINE_EXCLUSIVE"); the domain
 * model uses kebab-case strings ("one-size", "online-exclusive"). These two
 * helpers are the only place the spellings meet. Pure — shared by the database
 * source and the seed script.
 */

export function toDbEnum<T extends string>(value: string): T {
  return value.toUpperCase().replace(/-/g, "_") as T;
}

export function fromDbEnum<T extends string>(value: string): T {
  return value.toLowerCase().replace(/_/g, "-") as T;
}

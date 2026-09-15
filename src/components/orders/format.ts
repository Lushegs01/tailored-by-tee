/*
 * Order dates, always in Lagos time — where the studio is and where orders ship
 * from — whatever time zone the server renders in.
 */

const lagosDateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Lagos",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "14 Sep 2026". Built from parts: en-GB/en-NG now spell September "Sept". */
export function formatOrderDate(iso: string): string {
  const parts = lagosDateParts.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")}`;
}

/** "2:30 pm, 14 Sept" — the time a hold ends, as the order page has always shown it. */
export const lagosTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  hour: "numeric",
  minute: "2-digit",
  day: "numeric",
  month: "short",
});

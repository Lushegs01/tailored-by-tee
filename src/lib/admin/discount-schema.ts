import { z } from "zod";

import type { StatusDisplay } from "@/lib/admin/status";
import { normalizeCouponCode } from "@/lib/commerce/discounts";

import { formatAdminDateTime, formatKobo, formatNumber, parseNairaToKobo } from "./format";
import type { ListParamsAllowed } from "./pagination";
import { zCheckbox, zId, zNaira, zOptionalInt, zOptionalNaira, zOptionalText } from "./validation";

/*
 * Discount codes in the admin area: the form's validation, the codes' status,
 * and every sentence that describes a code. Pure (zod and formatting only), so
 * the server action, the list, the detail page and the form's live preview all
 * use the same rules and the same words.
 *
 * What checkout does with a stored code (lib/commerce/discounts.ts,
 * evaluateCoupon), which the wording here mirrors exactly:
 * - a switched-off code is refused; so is one before `startsAt` or at/after
 *   `endsAt` (the end is the first moment it no longer works);
 * - `usageLimit` counts every order placed with it, including checkouts still
 *   awaiting payment (their use is given back if the payment window closes);
 * - `perCustomerLimit` counts orders by the customer's email address;
 * - `minSubtotal` is compared with the whole bag before delivery and discount,
 *   including items the code doesn't cover;
 * - a restricted code applies to items in any chosen category OR any chosen
 *   product; with no restrictions, to the whole bag;
 * - percentage: that share of the qualifying items; fixed: that amount, never
 *   more than the qualifying items cost; either is capped by `maxDiscount` and
 *   rounded down to the whole naira;
 * - delivery is never discounted, and a free-delivery threshold is measured on
 *   the bag after the discount.
 */

export const DISCOUNTS_PATH = "/admin/discounts";
export const NEW_DISCOUNT_PATH = "/admin/discounts/new";

export function discountPath(id: string): string {
  return `${DISCOUNTS_PATH}/${encodeURIComponent(id)}`;
}

export const DISCOUNT_TYPES = ["PERCENTAGE", "FIXED"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const CODE_MIN_LENGTH = 3;
export const CODE_MAX_LENGTH = 32;
export const MAX_DESCRIPTION_LENGTH = 200;
export const MAX_PERCENT = 100;
export const MAX_USAGE_LIMIT = 1_000_000;
export const MAX_PER_CUSTOMER_LIMIT = 1_000;
export const MAX_RESTRICTED_CATEGORIES = 100;
export const MAX_RESTRICTED_PRODUCTS = 500;
/** Dates the form accepts: anything else is a typo. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export const LAGOS_TIME_ZONE = "Africa/Lagos";

/* ── Codes ──────────────────────────────────────────────────────────────── */

/** As checkout reads codes: spaces removed, capitals. " summer 10 " → "SUMMER10". */
export function normalizeDiscountCode(raw: string): string {
  return normalizeCouponCode(raw);
}

const CODE_CHARACTERS = /^[A-Z0-9-]+$/;
const CODE_EDGES = /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/;

/** Why a (normalised) code can't be used, or null when it's fine. */
export function discountCodeProblem(code: string): string | null {
  if (code === "") return "Enter a code.";
  if (!CODE_CHARACTERS.test(code)) return "Use only letters, numbers and hyphens.";
  if (code.length < CODE_MIN_LENGTH) return `Codes need at least ${CODE_MIN_LENGTH} characters.`;
  if (code.length > CODE_MAX_LENGTH) return `Codes can be up to ${CODE_MAX_LENGTH} characters.`;
  if (!CODE_EDGES.test(code)) return "Start and end the code with a letter or number.";
  if (code.includes("--")) return "Use one hyphen at a time.";
  return null;
}

/** A discount code field: normalised the way checkout reads it, then checked. */
export function zDiscountCode() {
  return z.preprocess(
    (value) => normalizeDiscountCode(typeof value === "string" ? value : ""),
    z.string().superRefine((code, context) => {
      const problem = discountCodeProblem(code);
      if (problem) context.addIssue({ code: "custom", message: problem });
    }),
  );
}

/** A suggested code for a copy: "WELCOME10" → "WELCOME10-COPY", kept within the length limit. */
export function suggestCopyCode(code: string): string {
  const suffix = "-COPY";
  const base = normalizeDiscountCode(code).slice(0, CODE_MAX_LENGTH - suffix.length).replace(/-+$/, "");
  return `${base || "CODE"}${suffix}`;
}

/* ── Lagos time ─────────────────────────────────────────────────────────── */

const lagosClock = new Intl.DateTimeFormat("en-US", {
  timeZone: LAGOS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function wallClock(instant: number) {
  const parts = lagosClock.formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** How far Lagos wall-clock time is ahead of UTC at `instant` (ms). West Africa Time is UTC+1 all year. */
function lagosOffset(instant: number): number {
  const clock = wallClock(instant);
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

const DATE_TIME_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/;

/**
 * A datetime-local value ("2026-10-01T09:00") read as Lagos time, as the instant
 * to store (UTC). Null when it isn't a real date and time between 2000 and 2100.
 */
export function parseLagosDateTime(value: string): Date | null {
  const match = DATE_TIME_INPUT.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map((part) => Number(part ?? 0));
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(naive);
  if (check.getUTCDate() !== day || check.getUTCMonth() !== month - 1) return null;

  let instant = naive - lagosOffset(naive);
  const corrected = naive - lagosOffset(instant);
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
}

/** A stored instant as a datetime-local value in Lagos time ("2026-10-01T09:00"); "" for none. */
export function toLagosDateTimeInput(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const clock = wallClock(date.getTime());
  const pad = (number: number, width = 2) => String(number).padStart(width, "0");
  return `${pad(clock.year, 4)}-${pad(clock.month)}-${pad(clock.day)}T${pad(clock.hour)}:${pad(clock.minute)}`;
}

/* ── The form ───────────────────────────────────────────────────────────── */

export interface DiscountInput {
  code: string;
  description: string | null;
  type: DiscountType;
  /** Whole percent (1–100) for PERCENTAGE; kobo (whole naira) for FIXED. */
  value: number;
  minSubtotal: number | null;
  /** Percentage codes only; always null for fixed amounts. */
  maxDiscount: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  categoryIds: string[];
  productIds: string[];
  /** Used when creating; editing changes it with the separate switch-on/off action. */
  isActive: boolean;
}

export interface DiscountSchemaContext {
  /** For "the end is in the past". */
  now: Date;
  /** The stored code when editing: its dates may stay as they are, and its limit can't drop below its uses. */
  current?: { startsAt: Date | null; endsAt: Date | null; usageCount: number } | null;
}

const WHOLE_NAIRA = "Use whole naira — checkout rounds every discount down to the naira.";
const IDS_MESSAGE = "Something in this list is out of date. Refresh the page and choose again.";

// Every key may be missing (an unticked checkbox, no restrictions chosen); each is checked below.
const rawField = z.unknown().optional();

const idList = (max: number, noun: string) =>
  z.preprocess(
    (value) => {
      const values = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
      return [...new Set(values.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()))];
    },
    z.array(zId(IDS_MESSAGE)).max(max, `Choose no more than ${formatNumber(max)} ${noun}.`),
  );

const percentField = z.preprocess(
  (value) => {
    const text = typeof value === "string" ? value.trim().replace(/\s*%$/, "") : "";
    if (text === "") return undefined;
    // Decimals ("12.5") and anything else fail as "not a whole percentage".
    return /^\d+$/.test(text) ? Number(text) : Number.NaN;
  },
  z
    .number({ error: (issue) => (issue.input === undefined ? "Enter the percentage off." : "Enter a whole percentage, e.g. 15.") })
    .int("Enter a whole percentage, e.g. 15.")
    .min(1, "The percentage must be at least 1%.")
    .max(MAX_PERCENT, "The percentage can’t be more than 100%."),
);

const wholeNaira = <T extends number | null>(schema: z.ZodType<T>) =>
  schema.refine((kobo) => kobo === null || kobo % 100 === 0, WHOLE_NAIRA);

const amountField = wholeNaira(zNaira({ min: 100, required: "Enter the amount off.", label: "The amount off" }));
const minimumField = z.preprocess(
  // "0" means no minimum.
  (value) => (typeof value === "string" && parseNairaToKobo(value) === 0 ? "" : value),
  wholeNaira(zOptionalNaira({ min: 100, label: "The minimum order" })),
);
const maximumField = wholeNaira(zOptionalNaira({ min: 100, label: "The maximum discount" }));

function dateField(which: "start" | "end") {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().transform((text, context) => {
      if (text === "") return null;
      const date = parseLagosDateTime(text);
      if (!date) {
        context.addIssue({
          code: "custom",
          message: `Enter the ${which} as a date and time, e.g. 1 October 2026 at 09:00.`,
        });
        return z.NEVER;
      }
      return date;
    }),
  );
}

/** Keeps the stored instant (with its seconds) when the field still shows it. */
function keepStored(submitted: Date | null, raw: unknown, stored: Date | null | undefined): Date | null {
  if (stored === undefined || stored === null || submitted === null) return submitted;
  return typeof raw === "string" && raw.trim() === toLagosDateTimeInput(stored) ? stored : submitted;
}

/**
 * The create/edit form (FormData from AdminForm, or a plain object). Every rule
 * is checked in one pass, so all the problems show at once. Field names:
 * code, description, type, percentOff, amountOff, minSubtotal, maxDiscount,
 * startsAt, endsAt (datetime-local, Lagos time), usageLimit, perCustomerLimit,
 * categoryIds[], productIds[], isActive.
 */
export function discountFormSchema(context: DiscountSchemaContext) {
  return z
    .object({
      code: rawField,
      description: rawField,
      type: rawField,
      percentOff: rawField,
      amountOff: rawField,
      minSubtotal: rawField,
      maxDiscount: rawField,
      startsAt: rawField,
      endsAt: rawField,
      usageLimit: rawField,
      perCustomerLimit: rawField,
      categoryIds: rawField,
      productIds: rawField,
      isActive: rawField,
    })
    .transform((raw, ctx): DiscountInput => {
      let failed = false;
      function take<T>(name: keyof typeof raw, schema: z.ZodType<T>): T {
        const result = schema.safeParse(raw[name]);
        if (result.success) return result.data;
        failed = true;
        ctx.addIssue({ code: "custom", path: [name], message: result.error.issues[0]?.message ?? "Check this field." });
        return undefined as T;
      }
      function problem(name: keyof typeof raw, message: string) {
        failed = true;
        ctx.addIssue({ code: "custom", path: [name], message });
      }

      const code = take("code", zDiscountCode());
      const description = take("description", zOptionalText({ max: MAX_DESCRIPTION_LENGTH, label: "The description" }));
      const type = take(
        "type",
        z.preprocess((value) => (typeof value === "string" ? value : ""), z.enum(DISCOUNT_TYPES, { error: "Choose a percentage or a fixed amount." })),
      );

      let value = 0;
      if (type === "PERCENTAGE") value = take("percentOff", percentField);
      else if (type === "FIXED") value = take("amountOff", amountField);

      const minSubtotal = take("minSubtotal", minimumField);
      const maxDiscount = type === "PERCENTAGE" ? take("maxDiscount", maximumField) : null;

      const current = context.current ?? null;
      const startsAt = keepStored(take("startsAt", dateField("start")), raw.startsAt, current?.startsAt);
      const endsAt = keepStored(take("endsAt", dateField("end")), raw.endsAt, current?.endsAt);
      if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
        problem("endsAt", "The end must be after the start.");
      } else if (endsAt && endsAt.getTime() <= context.now.getTime() && endsAt !== current?.endsAt) {
        problem("endsAt", "This end has already passed, so the code could never be used. Choose a later end, or switch the code off instead.");
      }

      const usageLimit = take(
        "usageLimit",
        zOptionalInt({ min: 1, max: MAX_USAGE_LIMIT, label: "The total number of uses" }),
      );
      if (usageLimit !== null && usageLimit !== undefined && current && usageLimit < current.usageCount) {
        problem(
          "usageLimit",
          `It has already been used ${timesWord(current.usageCount)}, so the limit can’t be lower than ${formatNumber(current.usageCount)}.`,
        );
      }
      const perCustomerLimit = take(
        "perCustomerLimit",
        zOptionalInt({ min: 1, max: MAX_PER_CUSTOMER_LIMIT, label: "The number of uses per customer" }),
      );
      if (
        perCustomerLimit !== null &&
        perCustomerLimit !== undefined &&
        usageLimit !== null &&
        usageLimit !== undefined &&
        perCustomerLimit > usageLimit
      ) {
        problem("perCustomerLimit", "This can’t be more than the total number of uses.");
      }

      const categoryIds = take("categoryIds", idList(MAX_RESTRICTED_CATEGORIES, "categories"));
      const productIds = take("productIds", idList(MAX_RESTRICTED_PRODUCTS, "products"));
      const isActive = take("isActive", zCheckbox());

      if (failed) return z.NEVER;
      return {
        code,
        description,
        type,
        value,
        minSubtotal,
        maxDiscount,
        startsAt,
        endsAt,
        usageLimit,
        perCustomerLimit,
        categoryIds,
        productIds,
        isActive,
      };
    });
}

/** Input for switching a code on or off. */
export const discountActiveSchema = z.object({
  id: zId(),
  active: z.boolean({ error: "Something is missing. Refresh the page and try again." }),
});

/** Input for deleting a code. */
export const discountIdSchema = z.object({ id: zId() });

/** Input for copying a code under a new one. */
export const discountDuplicateSchema = z.object({ id: zId(), code: zDiscountCode() });

/* ── Status ─────────────────────────────────────────────────────────────── */

export const DISCOUNT_STATUSES = ["active", "scheduled", "expired", "used_up", "disabled"] as const;
export type DiscountStatus = (typeof DISCOUNT_STATUSES)[number];

export interface DiscountStatusInput {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
}

/**
 * Where a code stands, checked in the same order as checkout: switched off,
 * not started, ended, used up — so the status is the reason a customer would
 * be turned away.
 */
export function discountStatus(coupon: DiscountStatusInput, now: Date = new Date()): DiscountStatus {
  if (!coupon.isActive) return "disabled";
  if (coupon.startsAt && now.getTime() < coupon.startsAt.getTime()) return "scheduled";
  if (coupon.endsAt && now.getTime() >= coupon.endsAt.getTime()) return "expired";
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) return "used_up";
  return "active";
}

const STATUS_LABELS: Record<DiscountStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  used_up: "Used up",
  disabled: "Switched off",
};

export const DISCOUNT_STATUS_OPTIONS: readonly { value: DiscountStatus; label: string }[] = DISCOUNT_STATUSES.map(
  (value) => ({ value, label: STATUS_LABELS[value] }),
);

/** The list's URL: ?q= (code or description), ?status=, ?sort=created|code|uses|ends&dir=, ?page=. */
export const DISCOUNT_LIST_ALLOWED = {
  sort: ["created", "code", "uses", "ends"],
  filters: ["status"],
  defaultSort: "created",
  defaultDir: "desc",
  filterValues: { status: DISCOUNT_STATUSES },
} as const satisfies ListParamsAllowed;

/** The status as a badge word, tone and one sentence (times in Lagos). */
export function discountStatusDisplay(coupon: DiscountStatusInput, now: Date = new Date()): StatusDisplay & {
  status: DiscountStatus;
} {
  const status = discountStatus(coupon, now);
  const label = STATUS_LABELS[status];
  switch (status) {
    case "active":
      return {
        status,
        label,
        tone: "positive",
        description: coupon.endsAt
          ? `Customers can use it until ${formatAdminDateTime(coupon.endsAt)}.`
          : "Customers can use it now.",
      };
    case "scheduled":
      return {
        status,
        label,
        tone: "info",
        description: `Starts ${formatAdminDateTime(coupon.startsAt as Date)}. Customers can’t use it before then.`,
      };
    case "expired":
      return {
        status,
        label,
        tone: "neutral",
        description: `Ended ${formatAdminDateTime(coupon.endsAt as Date)}. Customers can no longer use it.`,
      };
    case "used_up":
      return {
        status,
        label,
        tone: "neutral",
        description: `It has reached its limit of ${timesWord(coupon.usageLimit as number, "use")}. Raise the limit to let more orders use it.`,
      };
    case "disabled":
      return {
        status,
        label,
        tone: "neutral",
        description: "Switched off, so customers can’t use it. Switch it on when you’re ready.",
      };
  }
}

/* ── Words ──────────────────────────────────────────────────────────────── */

function timesWord(count: number, noun = "time"): string {
  return `${formatNumber(count)} ${count === 1 ? noun : `${noun}s`}`;
}

/** "a", "a or b", "a, b or c". */
function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/** Names in a sentence; beyond three, a count ("5 categories"). */
function nameList(names: readonly string[], noun: { one: string; other: string }): string {
  if (names.length > 3) return `${formatNumber(names.length)} ${noun.other}`;
  return joinOr(names);
}

/** "10%" or "₦5,000". */
export function discountAmountLabel(type: DiscountType, value: number): string {
  return type === "PERCENTAGE" ? `${value}%` : formatKobo(value);
}

export interface DiscountRuleInput {
  type: DiscountType;
  value: number;
  minSubtotal: number | null;
  maxDiscount: number | null;
  /** Names of the chosen categories; empty when the code isn't limited to categories. */
  categoryNames?: readonly string[];
  productNames?: readonly string[];
}

/** What the code's restrictions cover: "items in Shirts or Trousers, plus Knitted Polo"; null for the whole bag. */
export function describeDiscountScope(rule: Pick<DiscountRuleInput, "categoryNames" | "productNames">): string | null {
  const categories = rule.categoryNames ?? [];
  const products = rule.productNames ?? [];
  const parts: string[] = [];
  if (categories.length > 0) parts.push(`items in ${nameList(categories, { one: "category", other: "chosen categories" })}`);
  if (products.length > 0) {
    const list = nameList(products, { one: "product", other: "chosen products" });
    parts.push(parts.length > 0 ? `plus ${list}` : list);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * The rule in one line, as the list and the detail page show it:
 * "10% off every order", "10% off orders of ₦50,000 or more, up to ₦10,000",
 * "₦5,000 off items in Shirts, on orders of ₦30,000 or more".
 */
export function describeDiscountRule(rule: DiscountRuleInput): string {
  const amount = discountAmountLabel(rule.type, rule.value);
  const scope = describeDiscountScope(rule);
  const minimum = rule.minSubtotal !== null && rule.minSubtotal > 0 ? formatKobo(rule.minSubtotal) : null;

  let text: string;
  if (scope) text = `${amount} off ${scope}${minimum ? `, on orders of ${minimum} or more` : ""}`;
  else text = minimum ? `${amount} off orders of ${minimum} or more` : `${amount} off every order`;

  // Checkout caps either kind of discount, so the cap is named whenever one is stored — the form
  // only offers it for percentages, but a fixed code set up elsewhere may still carry one.
  if (rule.maxDiscount !== null) text += `, up to ${formatKobo(rule.maxDiscount)}`;
  return text;
}

export interface DiscountLimitsInput {
  usageLimit: number | null;
  perCustomerLimit: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** "12 of 100", or "12" with no limit. */
export function describeUses(usageCount: number, usageLimit: number | null): string {
  return usageLimit === null ? formatNumber(usageCount) : `${formatNumber(usageCount)} of ${formatNumber(usageLimit)}`;
}

/** "Once each", "3 each", "No limit". */
export function describePerCustomer(limit: number | null): string {
  if (limit === null) return "No limit";
  return limit === 1 ? "Once each" : `${formatNumber(limit)} each`;
}

/** The dates in one line, Lagos time. */
export function describeSchedule(dates: Pick<DiscountLimitsInput, "startsAt" | "endsAt">): string {
  const { startsAt, endsAt } = dates;
  if (startsAt && endsAt) return `${formatAdminDateTime(startsAt)} to ${formatAdminDateTime(endsAt)}`;
  if (startsAt) return `From ${formatAdminDateTime(startsAt)}, no end date`;
  if (endsAt) return `Until ${formatAdminDateTime(endsAt)}`;
  return "No start or end date";
}

/**
 * The rule spelled out, a sentence per point, for the form's summary and the
 * detail page — the same things checkout will do.
 */
export function describeDiscountDetails(rule: DiscountRuleInput & DiscountLimitsInput): string[] {
  const scope = describeDiscountScope(rule);
  const covers = scope ? "the items it covers" : "everything in the bag";
  const lines: string[] = [];

  if (scope) {
    lines.push(`Applies to ${scope}. Other items in the bag pay full price.`);
  } else {
    lines.push("Applies to everything in the bag.");
  }

  if (rule.type === "PERCENTAGE") {
    lines.push(`Takes ${rule.value}% off ${covers}, rounded down to the naira.`);
  } else {
    lines.push(
      `Takes ${formatKobo(rule.value)} off ${covers}. If they cost less than that, the discount is what they cost.`,
    );
  }
  // Checkout caps both kinds, so this is said for a fixed code carrying a cap from elsewhere too.
  if (rule.maxDiscount !== null) lines.push(`Never more than ${formatKobo(rule.maxDiscount)} off one order.`);

  if (rule.minSubtotal !== null && rule.minSubtotal > 0) {
    lines.push(
      scope
        ? `Only when the whole bag comes to ${formatKobo(rule.minSubtotal)} or more before delivery, counting items the code doesn’t cover.`
        : `Only when the bag comes to ${formatKobo(rule.minSubtotal)} or more before delivery.`,
    );
  }

  lines.push("Delivery is never discounted. Free delivery is judged on the bag after the discount.");

  lines.push(
    rule.usageLimit === null
      ? "No limit on how many orders can use it."
      : `Can be used on ${timesWord(rule.usageLimit, "order")} in total, counting checkouts still awaiting payment.`,
  );
  lines.push(
    rule.perCustomerLimit === null
      ? "A customer can use it on any number of orders."
      : `Each customer can use it ${rule.perCustomerLimit === 1 ? "once" : timesWord(rule.perCustomerLimit)}, checked by email address.`,
  );

  const { startsAt, endsAt } = rule;
  if (startsAt && endsAt) {
    lines.push(`Works from ${formatAdminDateTime(startsAt)} and stops at ${formatAdminDateTime(endsAt)} (Lagos time).`);
  } else if (startsAt) {
    lines.push(`Works from ${formatAdminDateTime(startsAt)} (Lagos time), with no end date.`);
  } else if (endsAt) {
    lines.push(`Works straight away and stops at ${formatAdminDateTime(endsAt)} (Lagos time).`);
  } else {
    lines.push("Works straight away, with no end date.");
  }
  return lines;
}

/** Things worth a second look before saving (not errors). */
export function discountWarnings(rule: DiscountRuleInput & Pick<DiscountLimitsInput, "endsAt">, now: Date): string[] {
  const warnings: string[] = [];
  const restricted = (rule.categoryNames?.length ?? 0) > 0 || (rule.productNames?.length ?? 0) > 0;
  if (rule.type === "PERCENTAGE" && rule.value >= MAX_PERCENT && rule.maxDiscount === null) {
    warnings.push(restricted ? "At 100% the items it covers are free." : "At 100% the whole bag is free.");
  } else if (rule.type === "PERCENTAGE" && rule.value >= 50 && rule.maxDiscount === null) {
    warnings.push("There’s no maximum discount, so a large order could save a lot. Consider setting one.");
  }
  if (rule.type === "FIXED" && rule.minSubtotal !== null && rule.value >= rule.minSubtotal && !restricted) {
    warnings.push("The amount off is as large as the minimum order, so some orders could be free.");
  }
  if (rule.endsAt && rule.endsAt.getTime() <= now.getTime()) {
    warnings.push("The end has already passed, so customers can’t use this code.");
  }
  return warnings;
}

/* ── The form's live summary ────────────────────────────────────────────── */

/** The form as typed (strings), for the summary beside it. */
export interface DiscountDraft {
  code: string;
  type: string;
  percentOff: string;
  amountOff: string;
  minSubtotal: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perCustomerLimit: string;
  categoryNames: readonly string[];
  productNames: readonly string[];
}

export interface DiscountPreview {
  /** The code as checkout will read it ("" when nothing usable is typed). */
  code: string;
  /** The one-line rule, or null until the discount itself is filled in. */
  summary: string | null;
  details: string[];
  warnings: string[];
}

function lenientCount(text: string): number | null {
  const cleaned = text.trim().replaceAll(",", "");
  if (!/^\d+$/.test(cleaned)) return null;
  const count = Number(cleaned);
  return count >= 1 ? count : null;
}

function lenientKobo(text: string): number | null {
  const kobo = parseNairaToKobo(text);
  return kobo !== null && kobo > 0 ? kobo : null;
}

/**
 * The summary for what's typed so far, using the same sentences as the saved
 * code. Lenient: anything not yet valid is left out (the server's checks decide).
 */
export function previewDiscount(draft: DiscountDraft, now: Date): DiscountPreview {
  const normalised = normalizeDiscountCode(draft.code);
  const code = discountCodeProblem(normalised) === null ? normalised : "";
  const type: DiscountType | null = draft.type === "PERCENTAGE" || draft.type === "FIXED" ? draft.type : null;

  let value: number | null = null;
  if (type === "PERCENTAGE") {
    const percent = lenientCount(draft.percentOff.replace(/\s*%$/, ""));
    value = percent !== null && percent <= MAX_PERCENT ? percent : null;
  } else if (type === "FIXED") {
    value = lenientKobo(draft.amountOff);
  }

  const startsAt = parseLagosDateTime(draft.startsAt);
  const endsAt = parseLagosDateTime(draft.endsAt);
  if (!type || value === null) return { code, summary: null, details: [], warnings: [] };

  const rule: DiscountRuleInput & DiscountLimitsInput = {
    type,
    value,
    minSubtotal: lenientKobo(draft.minSubtotal),
    maxDiscount: type === "PERCENTAGE" ? lenientKobo(draft.maxDiscount) : null,
    categoryNames: draft.categoryNames,
    productNames: draft.productNames,
    usageLimit: lenientCount(draft.usageLimit),
    perCustomerLimit: lenientCount(draft.perCustomerLimit),
    startsAt,
    endsAt: endsAt && startsAt && endsAt <= startsAt ? null : endsAt,
  };
  return {
    code,
    summary: describeDiscountRule(rule),
    details: describeDiscountDetails(rule),
    warnings: discountWarnings(rule, now),
  };
}

/* ── Changes (for the activity log) ─────────────────────────────────────── */

export interface DiscountSnapshot {
  code: string;
  description: string | null;
  type: DiscountType;
  value: number;
  minSubtotal: number | null;
  maxDiscount: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  categoryIds: readonly string[];
  productIds: readonly string[];
}

const sameDate = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);
const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join(" ") === [...b].sort().join(" ");

const money = (kobo: number | null) => (kobo === null ? "none" : formatKobo(kobo));
const when = (date: Date | null) => (date === null ? "none" : formatAdminDateTime(date));
const limit = (count: number | null) => (count === null ? "no limit" : formatNumber(count));

/** What an edit changed, in short phrases: ["discount 10% → 15%", "end none → 31 Oct 2026, 23:59"]. */
export function describeDiscountChanges(before: DiscountSnapshot, after: DiscountSnapshot): string[] {
  const changes: string[] = [];
  if (before.code !== after.code) changes.push(`code ${before.code} → ${after.code}`);
  if (before.type !== after.type || before.value !== after.value) {
    changes.push(`discount ${discountAmountLabel(before.type, before.value)} → ${discountAmountLabel(after.type, after.value)}`);
  }
  if (before.minSubtotal !== after.minSubtotal) {
    changes.push(`minimum order ${money(before.minSubtotal)} → ${money(after.minSubtotal)}`);
  }
  if (before.maxDiscount !== after.maxDiscount) {
    changes.push(`maximum discount ${money(before.maxDiscount)} → ${money(after.maxDiscount)}`);
  }
  if (!sameDate(before.startsAt, after.startsAt)) changes.push(`start ${when(before.startsAt)} → ${when(after.startsAt)}`);
  if (!sameDate(before.endsAt, after.endsAt)) changes.push(`end ${when(before.endsAt)} → ${when(after.endsAt)}`);
  if (before.usageLimit !== after.usageLimit) {
    changes.push(`total uses ${limit(before.usageLimit)} → ${limit(after.usageLimit)}`);
  }
  if (before.perCustomerLimit !== after.perCustomerLimit) {
    changes.push(`uses per customer ${limit(before.perCustomerLimit)} → ${limit(after.perCustomerLimit)}`);
  }
  if (!sameSet(before.categoryIds, after.categoryIds)) changes.push("categories it applies to");
  if (!sameSet(before.productIds, after.productIds)) changes.push("products it applies to");
  if ((before.description ?? "") !== (after.description ?? "")) changes.push("description");
  return changes;
}

/** Whether an edit changes what an order would get off (amount, type, minimum, cap or what it covers). */
export function changesDiscountAmount(before: DiscountSnapshot, after: DiscountSnapshot): boolean {
  return (
    before.type !== after.type ||
    before.value !== after.value ||
    before.minSubtotal !== after.minSubtotal ||
    before.maxDiscount !== after.maxDiscount ||
    !sameSet(before.categoryIds, after.categoryIds) ||
    !sameSet(before.productIds, after.productIds)
  );
}

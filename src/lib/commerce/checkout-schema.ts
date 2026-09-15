import { z } from "zod";

import { findState } from "@/config/nigeria";

import { normalizeNigerianPhone } from "./phone";

/*
 * Checkout input — one schema for the browser (instant field messages) and the
 * server (the authority). The server re-parses everything a request carries;
 * nothing the browser validated is trusted twice.
 *
 * Delivery and collection are separate branches of a discriminated union, so
 * every field is checked independently and a shopper sees all their mistakes at
 * once, rather than one round at a time.
 */

export const MAX_CHECKOUT_LINES = 50;

export const checkoutLinesSchema = z
  .array(
    z.strictObject({
      variantId: z.string().min(1).max(64),
      quantity: z.int().min(1).max(999),
    }),
  )
  .min(1, "Your bag is empty.")
  .max(MAX_CHECKOUT_LINES);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const contactShape = {
  email: z
    .string({ error: "Enter your email address." })
    .trim()
    .toLowerCase()
    .max(254, "That email address is too long.")
    .pipe(z.email({ error: "Enter a valid email address." })),
  phone: z
    .string({ error: "Enter your mobile number." })
    .trim()
    .transform((value, context) => {
      const normalized = normalizeNigerianPhone(value);
      if (!normalized) {
        context.addIssue({ code: "custom", message: "Enter a Nigerian mobile number, e.g. 0803 123 4567." });
        return z.NEVER;
      }
      return normalized;
    }),
  fullName: z
    .string({ error: "Enter your full name." })
    .trim()
    .min(2, "Enter your full name.")
    .max(100, "That name is too long."),
  deliveryNotes: optionalText(500),
  newsletter: z.boolean().default(false),
};

const addressShape = {
  line1: z
    .string({ error: "Enter the street address." })
    .trim()
    .min(3, "Enter the street address.")
    .max(200, "That address is too long."),
  line2: optionalText(200),
  city: z
    .string({ error: "Enter the town or city." })
    .trim()
    .min(2, "Enter the town or city.")
    .max(100, "That town name is too long."),
  state: z
    .string({ error: "Choose a state." })
    .trim()
    .toUpperCase()
    .refine((code) => findState(code) !== null, "Choose a state."),
  postalCode: optionalText(10).refine(
    (value) => value === undefined || /^\d{6}$/.test(value),
    "Postal codes are six digits.",
  ),
};

const deliverySchema = z.object({
  ...contactShape,
  deliveryMethod: z.literal("delivery"),
  ...addressShape,
});

/**
 * The fields of a delivery address — who it goes to and where — exactly as
 * checkout validates them. The account address book builds on these (not copies
 * of them), so a saved address always passes checkout.
 */
export const deliveryAddressShape = {
  fullName: contactShape.fullName,
  phone: contactShape.phone,
  ...addressShape,
};

const pickupSchema = z.object({
  ...contactShape,
  deliveryMethod: z.literal("pickup"),
});

export const checkoutDetailsSchema = z.discriminatedUnion("deliveryMethod", [deliverySchema, pickupSchema], {
  error: "Choose delivery or collection.",
});

export type CheckoutDetails = z.output<typeof checkoutDetailsSchema>;

export type CheckoutField =
  | "email"
  | "phone"
  | "fullName"
  | "deliveryMethod"
  | "line1"
  | "line2"
  | "city"
  | "state"
  | "postalCode"
  | "deliveryNotes"
  | "newsletter";

/** First message per field, for inline errors. */
export function checkoutFieldErrors(error: z.ZodError): Partial<Record<CheckoutField, string>> {
  const errors: Partial<Record<CheckoutField, string>> = {};
  for (const issue of error.issues) {
    const field = (issue.path[0] ?? "deliveryMethod") as CheckoutField;
    if (!(field in errors)) errors[field] = issue.message;
  }
  return errors;
}

export const couponCodeSchema = z
  .string()
  .trim()
  .max(32, "That code is too long.")
  .regex(/^[A-Za-z0-9 _-]*$/, "Codes use letters and numbers only.");

/** Identifies one browser checkout session (sessionStorage), for idempotency and superseding unpaid orders. */
export const checkoutSessionSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

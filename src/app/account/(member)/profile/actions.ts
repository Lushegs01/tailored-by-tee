"use server";

import { revalidatePath } from "next/cache";

import { updateProfile, type ProfileFieldErrors } from "@/lib/account/profile";
import { getCurrentUser } from "@/lib/auth/session";
import { formatNigerianPhone } from "@/lib/commerce/phone";
import { clientAddress, rateLimit } from "@/lib/security/rate-limit";

/*
 * Saves the profile form. Built for useActionState with a plain form post, so it
 * works before JavaScript loads. The user comes from the session; the email is
 * never read from the request — it isn't editable.
 */

export interface ProfileFormValues {
  name: string;
  phone: string;
}

export type ProfileActionResult =
  | { ok: true; message: string; values: ProfileFormValues; /** Distinguishes one save from the next, for announcements. */ savedAt: number }
  | { ok: false; message: string; fieldErrors?: ProfileFieldErrors; values?: ProfileFormValues };

function text(value: FormDataEntryValue | null): string {
  // Generous but bounded: the schema has the real limits and messages.
  return typeof value === "string" ? value.slice(0, 300) : "";
}

export async function saveProfile(_previous: ProfileActionResult | null, formData: FormData): Promise<ProfileActionResult> {
  if (!(formData instanceof FormData)) {
    return { ok: false, message: "We couldn’t read that form. Please refresh the page and try again." };
  }
  const values: ProfileFormValues = { name: text(formData.get("name")), phone: text(formData.get("phone")) };

  if (!rateLimit(`account-profile-ip:${await clientAddress()}`, { limit: 30, windowMs: 10 * 60_000 }).ok) {
    return { ok: false, message: "Too many changes in a short time. Please wait a few minutes and try again.", values };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "You’ve been signed out. Sign in again to update your details.", values };
  if (!rateLimit(`account-profile:${user.id}`, { limit: 10, windowMs: 10 * 60_000 }).ok) {
    return { ok: false, message: "Too many changes in a short time. Please wait a few minutes and try again.", values };
  }

  try {
    const result = await updateProfile(user.id, values);
    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        fieldErrors: result.reason === "invalid" ? result.fieldErrors : undefined,
        values,
      };
    }

    // The whole account area, layout included: its greeting shows the name.
    revalidatePath("/account", "layout");
    return {
      ok: true,
      message: "Your details are saved.",
      values: {
        name: result.profile.name ?? "",
        phone: result.profile.phone ? formatNigerianPhone(result.profile.phone) : "",
      },
      savedAt: Date.now(),
    };
  } catch (error) {
    console.error("[account] could not update the profile", error);
    return { ok: false, message: "We couldn’t save your details just now. Please try again.", values };
  }
}

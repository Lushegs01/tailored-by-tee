import type { Metadata } from "next";

import { ProfileForm } from "@/components/account/profile-form";
import { siteConfig } from "@/config/site";
import { getProfile } from "@/lib/account/profile";
import { requireUser } from "@/lib/auth/session";
import { formatNigerianPhone } from "@/lib/commerce/phone";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

const lagosMonthParts = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", month: "long", year: "numeric" });

/** "September 2026", in Lagos time. */
function formatMemberSince(iso: string): string {
  const parts = lagosMonthParts.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("month")} ${part("year")}`;
}

export default async function ProfilePage() {
  // The layout checks too, but layouts and pages render in parallel.
  const user = await requireUser("/account/profile");
  const profile = await getProfile(user.id);

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="font-display text-display-sm">Profile</h1>
        <p className="mt-5 text-body text-muted-foreground">The name and mobile number we keep with your account.</p>
      </header>

      <ProfileForm
        className="mt-10 md:mt-14"
        initial={{
          name: profile?.name ?? user.name ?? "",
          phone: profile?.phone ? formatNigerianPhone(profile.phone) : "",
        }}
        email={profile?.email ?? user.email}
        supportEmail={siteConfig.contact.email}
      />

      {profile ? (
        <dl className="mt-14 flex max-w-xl flex-wrap gap-x-3 border-t pt-6 text-body-sm">
          <dt className="text-muted-foreground">Member since</dt>
          <dd>
            <time dateTime={profile.memberSince}>{formatMemberSince(profile.memberSince)}</time>
          </dd>
        </dl>
      ) : null}
    </div>
  );
}

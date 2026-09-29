import { Suspense } from "react";

import { ACTIVITY_SECTION_ID, ActivitySection } from "@/components/admin/settings/activity-section";
import { ADMIN_TEAM_SECTION_ID, AdminTeamSection } from "@/components/admin/settings/admin-team-section";
import { INTEGRATIONS_SECTION_ID, IntegrationsSection } from "@/components/admin/settings/integrations-section";
import { SectionSkeleton } from "@/components/admin/settings/settings-skeletons";
import { STORE_CONFIG_SECTION_ID, StoreConfigSection } from "@/components/admin/settings/store-config-section";
import { AdminPageHeader } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin/auth";
import { adminMetadata } from "@/lib/admin/metadata";

export const metadata = adminMetadata("Settings");

const ON_THIS_PAGE = [
  { id: INTEGRATIONS_SECTION_ID, label: "Connected services" },
  { id: ADMIN_TEAM_SECTION_ID, label: "Admin team" },
  { id: STORE_CONFIG_SECTION_ID, label: "Store details" },
  { id: ACTIVITY_SECTION_ID, label: "Recent activity" },
] as const;

/**
 * Settings: whether each outside service is connected (never showing a secret),
 * who has admin access, the store details the site runs on (read-only, edited in
 * code for now) and the latest admin changes. The two database-backed sections
 * stream in, so the configuration shows at once.
 */
export default async function AdminSettingsPage() {
  const admin = await requireAdminPage("/admin/settings");

  return (
    <>
      <AdminPageHeader
        title="Settings"
        description="How the store is connected, who can use this admin area, and the store details the site runs on."
      />

      <nav aria-label="On this page" className="mt-4">
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-body-sm">
          {ON_THIS_PAGE.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="inline-flex min-h-10 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="link-underline pb-0.5">{item.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-4 space-y-8">
        <IntegrationsSection />

        <Suspense fallback={<SectionSkeleton id={ADMIN_TEAM_SECTION_ID} title="Admin team" rows={2} />}>
          <AdminTeamSection currentAdminId={admin.id} />
        </Suspense>

        <StoreConfigSection />

        <Suspense fallback={<SectionSkeleton id={ACTIVITY_SECTION_ID} title="Recent activity" rows={6} />}>
          <ActivitySection />
        </Suspense>
      </div>
    </>
  );
}

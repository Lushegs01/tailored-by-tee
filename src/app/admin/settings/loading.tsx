import { SettingsPageSkeleton } from "@/components/admin/settings/settings-skeletons";

/** Shown while the settings page loads: the header and section frames, not a list. */
export default function AdminSettingsLoading() {
  return <SettingsPageSkeleton />;
}

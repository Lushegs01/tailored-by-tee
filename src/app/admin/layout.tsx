import type { Metadata } from "next";
import Link from "next/link";

import { AdminAccount, ViewStoreLink } from "@/components/admin/shell/admin-account";
import { AdminMobileNav } from "@/components/admin/shell/admin-mobile-nav";
import { AdminNav } from "@/components/admin/shell/admin-nav";
import { Wordmark } from "@/components/brand/wordmark";
import { requireAdminPage } from "@/lib/admin/auth";
import { ADMIN_ROBOTS, ADMIN_TITLE_SUFFIX } from "@/lib/admin/metadata";
import { getAdminNavCounts } from "@/lib/admin/nav-counts";

// Pages set their own titles with adminMetadata("Orders"); this is the fallback.
export const metadata: Metadata = {
  title: { absolute: ADMIN_TITLE_SUFFIX, template: `%s — ${ADMIN_TITLE_SUFFIX}` },
  robots: ADMIN_ROBOTS,
};

/**
 * The admin shell: a self-contained operational frame (sidebar from lg, a compact
 * top bar with a menu sheet below it) around every /admin page.
 *
 * Signed-out visitors are sent to sign in; signed-in people without the admin
 * role get the ordinary 404. Layouts and pages render in parallel, so every admin
 * page also calls requireAdminPage itself.
 *
 * The navigation counts are fetched without blocking the frame: the promise is
 * handed to the nav, which shows the links at once and the counts when ready.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdminPage("/admin");
  const counts = getAdminNavCounts();

  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <a href="#admin-content" className="skip-link">
        Skip to content
      </a>

      {/* Sidebar, lg and up. */}
      <div className="hidden border-r bg-background-raised lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex h-16 shrink-0 items-center border-b px-4">
          <AdminHomeLink />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          <AdminNav counts={counts} />
        </div>
        <AdminAccount email={admin.email} />
      </div>

      <div className="min-w-0">
        {/* Top bar, below lg. */}
        <div className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b bg-background-raised pr-4 pl-1 lg:hidden">
          <AdminMobileNav counts={counts} email={admin.email} />
          <AdminHomeLink />
          <ViewStoreLink className="ml-auto" />
        </div>

        <main id="admin-content" tabIndex={-1} className="px-4 pt-6 pb-16 outline-none md:px-8 md:pt-8 xl:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}

function AdminHomeLink() {
  return (
    <Link href="/admin" className="flex min-h-10 min-w-0 items-baseline gap-2.5">
      <Wordmark className="text-[0.625rem]" />
      <span className="text-label text-muted-foreground">Admin</span>
    </Link>
  );
}

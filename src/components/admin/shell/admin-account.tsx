import { ArrowUpRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

import { AdminSignOutButton } from "./admin-sign-out";

/** Opens the storefront in a new tab, so the admin page stays where it was. */
export function ViewStoreLink({ className }: { className?: string }) {
  return (
    <a
      href="/"
      target="_blank"
      rel="noopener"
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 text-body-sm text-foreground transition-opacity duration-200 hover:opacity-70",
        className,
      )}
    >
      View store
      <ArrowUpRightIcon aria-hidden="true" className="text-base" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Who is signed in, with View store and Sign out. Foot of the sidebar and of the phone menu. */
export function AdminAccount({ email, className }: { email: string; className?: string }) {
  return (
    <div className={cn("border-t px-4 py-3", className)}>
      <p className="text-caption text-muted-foreground">Signed in as</p>
      <p className="truncate text-body-sm" title={email}>
        {email}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-6">
        <ViewStoreLink />
        <AdminSignOutButton />
      </div>
    </div>
  );
}

import { AdminEmptyState } from "@/components/admin/ui";

/*
 * What a settings section shows when its data can't be read: the admin migration
 * hasn't been applied yet, or the database didn't answer. The rest of the page
 * still works.
 */

/** The admin tables or columns are missing: `npm run db:deploy` hasn't been run against this database. */
export function NeedsMigrationNotice({ what }: { what: string }) {
  return (
    <AdminEmptyState
      title="The database needs an update"
      body={
        <>
          {what} can’t be shown until the latest database changes are applied. Ask your developer to run{" "}
          <code className="font-mono text-caption text-foreground">npm run db:deploy</code>, then refresh this page.
        </>
      }
    />
  );
}

/** A read failed for another reason (details are in the server log). */
export function ReadFailureNotice({ what }: { what: string }) {
  return (
    <AdminEmptyState
      title="This didn’t load"
      body={`We couldn’t read ${what} just now. Refresh the page to try again. Nothing has been changed.`}
    />
  );
}

import {
  AdminEmptyState,
  AdminSection,
  DataTable,
  RowHeader,
  StatusBadge,
  TBody,
  THead,
  TableMessageRow,
  Td,
  Th,
  Tr,
} from "@/components/admin/ui";
import { formatAdminDate } from "@/lib/admin/format";
import { listAdminTeam, type AdminTeamMember } from "@/lib/admin/team";

import { GrantAdminForm } from "./grant-admin-form";
import { NeedsMigrationNotice, ReadFailureNotice } from "./notices";
import { RevokeAdminButton } from "./revoke-admin-button";
import { SETTINGS_SECTION_CLASS } from "./settings-skeletons";
import { TeamFeedback } from "./team-feedback";

export const ADMIN_TEAM_SECTION_ID = "admin-team";

const BOOTSTRAP_COMMAND = "npm run admin:grant -- owner@example.com --yes";

/**
 * Who can open the admin area, with "give access" and "remove access". Reads the
 * database on every request (the page is dynamic), so it always shows the roles
 * the access checks are using.
 */
export async function AdminTeamSection({ currentAdminId }: { currentAdminId: string }) {
  const team = await listAdminTeam();

  return (
    <AdminSection
      id={ADMIN_TEAM_SECTION_ID}
      className={SETTINGS_SECTION_CLASS}
      title="Admin team"
      description="People who can open this admin area. Access is checked on every page, so a change takes effect on the person’s next click."
      flush
    >
      {team.ok ? (
        <TeamFeedback>
          <TeamTable members={team.data} currentAdminId={currentAdminId} />
        </TeamFeedback>
      ) : team.reason === "needs_migration" ? (
        <NeedsMigrationNotice what="The admin team" />
      ) : (
        <ReadFailureNotice what="the admin team" />
      )}

      {team.ok ? (
        <div className="border-t px-4 py-5 md:px-5">
          <h3 className="text-body-sm font-medium">Give someone admin access</h3>
          <p className="mt-1 mb-4 max-w-2xl text-caption text-muted-foreground">
            They sign in at the store’s sign-in page with this email address, then open the admin area. If they’ve
            never signed in, their account is created now with admin access switched on, so their first sign-in brings
            them here. Only give access to people you trust with orders, customers and refunds.
          </p>
          <GrantAdminForm />
        </div>
      ) : null}

      <details className="group border-t px-4 py-3 md:px-5">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-body-sm [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="inline-block w-3 text-muted-foreground transition-transform group-open:rotate-90">
            ›
          </span>
          Setting up the very first admin (for your developer)
        </summary>
        <div className="max-w-2xl pb-2 pl-5 text-caption text-muted-foreground">
          <p>
            With no admins yet, nobody can open this page, so the first one is set from the command line on a computer
            connected to the store’s database:
          </p>
          <pre className="mt-2 overflow-x-auto border bg-surface/50 px-3 py-2 font-mono text-caption text-foreground">
            <code>{BOOTSTRAP_COMMAND}</code>
          </pre>
          <p className="mt-2">
            Use the owner’s real email address. Without “--yes” it only shows what would change. The same command with
            “--revoke” removes access, and every change is recorded in the activity below.
          </p>
        </div>
      </details>
    </AdminSection>
  );
}

function TeamTable({ members, currentAdminId }: { members: AdminTeamMember[]; currentAdminId: string }) {
  const onlyOne = members.length <= 1;

  return (
    <DataTable caption="Admin team" frameClassName="border-0">
      <THead>
        <Tr>
          <Th>Person</Th>
          <Th>Admin since</Th>
          <Th>Signed in</Th>
          <Th>
            <span className="sr-only">Actions</span>
          </Th>
        </Tr>
      </THead>
      <TBody>
        {members.length === 0 ? (
          <TableMessageRow colSpan={4}>
            <AdminEmptyState
              title="No admins found"
              body="That’s unexpected while you’re signed in as one. Refresh the page; if this stays empty, ask your developer to check the database."
            />
          </TableMessageRow>
        ) : (
          members.map((member) => {
            const isYou = member.id === currentAdminId;
            return (
              <Tr key={member.id}>
                <RowHeader>
                  <span className="block break-all">{member.name ?? member.email}</span>
                  {member.name ? (
                    <span className="block text-caption font-normal break-all text-muted-foreground">{member.email}</span>
                  ) : null}
                  {isYou || member.isDemo ? (
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {isYou ? <StatusBadge tone="info">You</StatusBadge> : null}
                      {member.isDemo ? <StatusBadge tone="attention">Demo account</StatusBadge> : null}
                    </span>
                  ) : null}
                </RowHeader>
                <Td label="Admin since" className="tabular-nums whitespace-nowrap">
                  <time
                    dateTime={member.adminSince.toISOString()}
                    title={
                      member.adminSinceSource === "account"
                        ? "When their account was created. The date they became an admin wasn’t recorded."
                        : undefined
                    }
                  >
                    {formatAdminDate(member.adminSince)}
                  </time>
                </Td>
                <Td label="Signed in">
                  {member.hasSignedIn ? (
                    <span>Yes</span>
                  ) : (
                    <StatusBadge tone="attention">Not yet</StatusBadge>
                  )}
                </Td>
                <Td align="end" className="max-md:group-data-[layout=stack]/table:mt-1">
                  {isYou ? (
                    <span className="text-caption text-muted-foreground">
                      {onlyOne ? "The only admin" : "Another admin can remove you"}
                    </span>
                  ) : onlyOne ? null : (
                    <RevokeAdminButton userId={member.id} email={member.email} />
                  )}
                </Td>
              </Tr>
            );
          })
        )}
      </TBody>
    </DataTable>
  );
}

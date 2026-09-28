import {
  AdminEmptyState,
  AdminSection,
  DataTable,
  RowHeader,
  RowLink,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from "@/components/admin/ui";
import { formatAdminDateTime, formatRelative } from "@/lib/admin/format";
import { activityActorLabel, auditActionLabel } from "@/lib/admin/settings";
import { RECENT_ACTIVITY_LIMIT, listRecentActivity, type ActivityEntry } from "@/lib/admin/team";

import { NeedsMigrationNotice, ReadFailureNotice } from "./notices";
import { SETTINGS_SECTION_CLASS } from "./settings-skeletons";

export const ACTIVITY_SECTION_ID = "activity";

/** The latest changes made in the admin area (the audit log), newest first. */
export async function ActivitySection() {
  const activity = await listRecentActivity(RECENT_ACTIVITY_LIMIT);
  const now = new Date();

  return (
    <AdminSection
      id={ACTIVITY_SECTION_ID}
      className={SETTINGS_SECTION_CLASS}
      title="Recent activity"
      description={`The latest ${RECENT_ACTIVITY_LIMIT} changes made in the admin area, newest first, and who made them. An order’s progress and an item’s stock movements are also kept in their own history.`}
      flush
    >
      {!activity.ok ? (
        activity.reason === "needs_migration" ? (
          <NeedsMigrationNotice what="Recent activity" />
        ) : (
          <ReadFailureNotice what="recent activity" />
        )
      ) : activity.data.length === 0 ? (
        <AdminEmptyState
          title="No changes recorded yet"
          body="Changes made here, such as to products, prices, discounts, reviews or admin access, will be listed with who made them and when."
        />
      ) : (
        <ActivityTable entries={activity.data} now={now} />
      )}
    </AdminSection>
  );
}

function ActivityTable({ entries, now }: { entries: ActivityEntry[]; now: Date }) {
  return (
    <DataTable caption="Recent admin activity" frameClassName="border-0">
      <THead>
        <Tr>
          <Th>Change</Th>
          <Th>Who</Th>
          <Th>When</Th>
        </Tr>
      </THead>
      <TBody>
        {entries.map((entry) => {
          const label = auditActionLabel(entry.action);
          const summary = entry.summary.trim();
          return (
            <Tr key={entry.id} interactive={Boolean(entry.href)}>
              <RowHeader>
                {entry.href ? <RowLink href={entry.href}>{label}</RowLink> : label}
                {summary && summary !== label ? (
                  <span className="mt-0.5 block text-body-sm font-normal break-words text-muted-foreground">{summary}</span>
                ) : null}
              </RowHeader>
              <Td label="Who" className="max-md:break-all">
                {entry.actor ? (
                  <span title={entry.actor.name ?? undefined}>{activityActorLabel(entry.actor)}</span>
                ) : (
                  <span className="text-muted-foreground">{activityActorLabel(null)}</span>
                )}
              </Td>
              <Td label="When" className="whitespace-nowrap tabular-nums">
                <time dateTime={entry.createdAt.toISOString()} title={formatAdminDateTime(entry.createdAt)}>
                  {formatRelative(entry.createdAt, now)}
                </time>
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </DataTable>
  );
}

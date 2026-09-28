import type { ReactNode } from "react";

import {
  AdminSection,
  DataTable,
  KeyValueList,
  RowHeader,
  StatusBadge,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from "@/components/admin/ui";
import { deliveryPolicy, returnsPolicy, type DeliveryZone } from "@/config/policies";
import { siteConfig } from "@/config/site";
import { formatKobo, formatNumber } from "@/lib/admin/format";
import { describeZoneCoverage, isPlaceholderContact, type ContactField } from "@/lib/admin/settings";

import { SETTINGS_SECTION_CLASS } from "./settings-skeletons";

export const STORE_CONFIG_SECTION_ID = "store-details";

const SITE_FILE = "src/config/site.ts";
const POLICIES_FILE = "src/config/policies.ts";

/**
 * The store details the site runs on, read-only. They live in code for now
 * (config/site.ts and config/policies.ts); editable settings come later, so this
 * shows what's live, flags placeholders, and says where each one is changed.
 */
export function StoreConfigSection() {
  const zones: readonly DeliveryZone[] = deliveryPolicy.zones;
  const freeZones = zones.filter((zone) => zone.freeOver !== null);
  const pickup = deliveryPolicy.pickup;
  const contact = siteConfig.contact;
  const commerce = siteConfig.commerce;

  return (
    <AdminSection
      id={STORE_CONFIG_SECTION_ID}
      className={SETTINGS_SECTION_CLASS}
      title="Store details"
      description="Read-only for now. These live in the site’s code: ask your developer to change them in the file named under each group, then redeploy. Editable store settings will come later."
      bodyClassName="space-y-8"
    >
      <Group title="Store and contact" file={SITE_FILE}>
        <KeyValueList
          items={[
            { label: "Store name", value: siteConfig.name },
            { label: "Contact email", value: <Contact field="email" value={contact.email} />, breakAll: true },
            { label: "Phone", value: <Contact field="phone" value={contact.phone} /> },
            { label: "Opening hours", value: contact.hours },
            { label: "Studio address", value: <Contact field="address" value={contact.address} /> },
            {
              label: "Announcement bar",
              value: siteConfig.announcement ? siteConfig.announcement.message : "Off",
            },
          ]}
        />
      </Group>

      <Group
        title="Delivery"
        file={POLICIES_FILE}
        badge={deliveryPolicy.isPlaceholder ? <PlaceholderBadge>Placeholder terms</PlaceholderBadge> : null}
        note={
          deliveryPolicy.isPlaceholder
            ? "These fees and times are examples until the studio confirms its real delivery terms, but checkout already charges them. Confirm them before launch."
            : undefined
        }
      >
        <DataTable caption="Delivery zones and fees">
          <THead>
            <Tr>
              <Th>Zone</Th>
              <Th>Covers</Th>
              <Th align="end">Fee</Th>
              <Th>Free delivery</Th>
              <Th>Delivery time</Th>
            </Tr>
          </THead>
          <TBody>
            {zones.map((zone) => (
              <Tr key={zone.id}>
                <RowHeader>{zone.name}</RowHeader>
                <Td label="Covers">{describeZoneCoverage(zone.states)}</Td>
                <Td label="Fee" align="end">
                  {zone.fee === 0 ? "Free" : formatKobo(zone.fee)}
                </Td>
                <Td label="Free delivery" className="tabular-nums">
                  {zone.freeOver === null ? "Never" : `Orders of ${formatKobo(zone.freeOver)} or more`}
                </Td>
                <Td label="Delivery time">{zone.estimate}</Td>
              </Tr>
            ))}
          </TBody>
        </DataTable>

        <KeyValueList
          className="mt-4"
          items={[
            {
              label: "Free-delivery threshold",
              value: (
                <>
                  <span className="tabular-nums">{formatKobo(commerce.freeDeliveryThreshold)}</span>
                  <span className="text-muted-foreground">
                    {freeZones.length > 0
                      ? ` (applies to ${freeZones.map((zone) => zone.name).join(", ")})`
                      : " (no delivery zone uses it at the moment)"}
                  </span>
                </>
              ),
            },
            {
              label: "Studio pickup",
              value:
                pickup && pickup.enabled ? (
                  <>
                    <span className="block">{pickup.name}: free</span>
                    <span className="block text-muted-foreground">{pickup.address}</span>
                    <span className="block text-muted-foreground">{pickup.estimate}</span>
                  </>
                ) : (
                  "Off"
                ),
            },
            { label: "Dispatch", value: deliveryPolicy.dispatch },
          ]}
        />
      </Group>

      <Group title="Orders and stock" file={SITE_FILE}>
        <KeyValueList
          items={[
            {
              label: "Payment window",
              value: `Unpaid orders hold their stock for ${formatNumber(commerce.reservationMinutes)} minutes, then it goes back on sale.`,
            },
            {
              label: "Most per item",
              value: `Customers can buy up to ${formatNumber(commerce.maxQuantityPerLine)} of each size and colour in one order.`,
            },
            {
              label: "Low-stock level",
              value: `Stock is flagged as low at ${formatNumber(commerce.defaultLowStockThreshold)} or fewer available, unless an item has its own level (set in Inventory).`,
            },
          ]}
        />
      </Group>

      <Group
        title="Returns"
        file={POLICIES_FILE}
        badge={returnsPolicy.isPlaceholder ? <PlaceholderBadge>Placeholder terms</PlaceholderBadge> : null}
        note={
          returnsPolicy.isPlaceholder
            ? "These terms are examples until the studio confirms its real returns policy. Confirm them before launch."
            : undefined
        }
      >
        <KeyValueList
          items={[
            { label: "Returns window", value: `${formatNumber(returnsPolicy.windowDays)} days from delivery` },
            { label: "Summary", value: returnsPolicy.summary },
          ]}
        />
      </Group>
    </AdminSection>
  );
}

function Group({
  title,
  file,
  badge,
  note,
  children,
}: {
  title: string;
  file: string;
  badge?: ReactNode;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="text-body-sm font-medium">{title}</h3>
        {badge}
      </div>
      <p className="mt-1 text-caption text-muted-foreground">
        Changed in <code className="font-mono break-all text-foreground">{file}</code>
      </p>
      {note ? <p className="mt-2 max-w-2xl text-caption text-muted-foreground">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function PlaceholderBadge({ children = "Placeholder" }: { children?: ReactNode }) {
  return <StatusBadge tone="attention">{children}</StatusBadge>;
}

/** A contact detail, flagged when it still looks like the placeholder the site shipped with. */
function Contact({ field, value }: { field: ContactField; value: string }) {
  const placeholder = isPlaceholderContact(field, value);
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="min-w-0">{value || "Not set"}</span>
      {placeholder ? <PlaceholderBadge /> : null}
    </span>
  );
}

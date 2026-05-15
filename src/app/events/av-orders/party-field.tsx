"use client";

import { useState } from "react";
import type { ResponsiblePartyOptions } from "@/app/vendors/actions";

export type PartyOptions = { id: string; name: string }[];
export type ContactOptions = {
  id: string;
  firstName: string;
  lastName: string;
  organization: string | null;
}[];

export function contactName(c: {
  firstName: string;
  lastName: string;
  organization: string | null;
}) {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return c.organization ? `${name} (${c.organization})` : name;
}

export function parsePartyValue(value: string) {
  if (value.startsWith("vendor:")) return { vendorId: value.slice(7), contactId: "" };
  if (value.startsWith("contact:")) return { vendorId: "", contactId: value.slice(8) };
  return { vendorId: "", contactId: "" };
}

export function mergeExtraVendorsIntoGroup(
  groups: ResponsiblePartyOptions,
  extra: (PartyOptions[number] | null | undefined)[]
): ResponsiblePartyOptions {
  const knownIds = new Set([
    ...(groups.systemVendor ? [groups.systemVendor.id] : []),
    ...(groups.venueVendor ? [groups.venueVendor.id] : []),
    ...groups.vendors.map((v) => v.id),
  ]);
  const extras = extra.filter((v): v is { id: string; name: string } => v != null && !knownIds.has(v.id));
  if (!extras.length) return groups;
  return { ...groups, vendors: [...groups.vendors, ...extras].sort((a, b) => a.name.localeCompare(b.name)) };
}

export function mergeAndSortVendors(
  baseVendors: PartyOptions,
  extra: (PartyOptions[number] | null | undefined)[]
): PartyOptions {
  const map = new Map(baseVendors.map((v) => [v.id, v]));
  for (const vendor of extra) {
    if (vendor) map.set(vendor.id, vendor);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function partyLabel(
  vendorObj: { name: string } | null | undefined,
  contactObj: { firstName: string; lastName: string } | null | undefined
): string | null {
  if (vendorObj) return vendorObj.name;
  if (contactObj)
    return [contactObj.firstName, contactObj.lastName].filter(Boolean).join(" ");
  return null;
}

export function PartyField({
  fieldPrefix,
  vendors,
  vendorGroups,
  contacts,
  contactsLabel = "Contacts",
  defaultVendorId,
  defaultContactId,
}: {
  fieldPrefix: string;
  vendors?: PartyOptions;
  vendorGroups?: ResponsiblePartyOptions;
  contacts: ContactOptions;
  contactsLabel?: string;
  defaultVendorId?: string | null;
  defaultContactId?: string | null;
}) {
  const initialValue = defaultVendorId
    ? `vendor:${defaultVendorId}`
    : defaultContactId
    ? `contact:${defaultContactId}`
    : "";
  const [selected, setSelected] = useState(initialValue);
  const { vendorId, contactId } = parsePartyValue(selected);

  return (
    <div>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
      >
        <option value="">— None —</option>
        {vendorGroups ? (
          <>
            {vendorGroups.systemVendor && (
              <option value={`vendor:${vendorGroups.systemVendor.id}`}>{vendorGroups.systemVendor.name}</option>
            )}
            {vendorGroups.venueVendor && (
              <optgroup label="Venue">
                <option value={`vendor:${vendorGroups.venueVendor.id}`}>{vendorGroups.venueVendor.name}</option>
              </optgroup>
            )}
            {vendorGroups.vendors.length > 0 && (
              <optgroup label="Vendors">
                {vendorGroups.vendors.map((v) => (
                  <option key={v.id} value={`vendor:${v.id}`}>{v.name}</option>
                ))}
              </optgroup>
            )}
          </>
        ) : vendors && vendors.length > 0 ? (
          <optgroup label="Vendors">
            {vendors.map((v) => (
              <option key={v.id} value={`vendor:${v.id}`}>{v.name}</option>
            ))}
          </optgroup>
        ) : null}
        {contacts.length > 0 && (
          <optgroup label={contactsLabel}>
            {contacts.map((c) => (
              <option key={c.id} value={`contact:${c.id}`}>{contactName(c)}</option>
            ))}
          </optgroup>
        )}
      </select>
      <input type="hidden" name={`${fieldPrefix}VendorId`} value={vendorId} />
      <input type="hidden" name={`${fieldPrefix}ContactId`} value={contactId} />
    </div>
  );
}

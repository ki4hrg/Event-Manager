"use client";

import { useState } from "react";
import type { Vendor, Contact } from "@prisma/client";

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
  vendorObj: Vendor | null,
  contactObj: Contact | null
): string | null {
  if (vendorObj) return vendorObj.name;
  if (contactObj)
    return [contactObj.firstName, contactObj.lastName].filter(Boolean).join(" ");
  return null;
}

export function PartyField({
  fieldPrefix,
  vendors,
  contacts,
  defaultVendorId,
  defaultContactId,
}: {
  fieldPrefix: "provider" | "operator";
  vendors: PartyOptions;
  contacts: ContactOptions;
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
        {vendors.length > 0 && (
          <optgroup label="Vendors">
            {vendors.map((v) => (
              <option key={v.id} value={`vendor:${v.id}`}>{v.name}</option>
            ))}
          </optgroup>
        )}
        {contacts.length > 0 && (
          <optgroup label="Contacts">
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

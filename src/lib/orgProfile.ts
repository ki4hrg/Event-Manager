// Organization (Tenant) profile: contact details edited on /tenants/[id] and
// /settings/organization, and used as defaults for the ESG §A host-organization
// fields an event's specification leaves blank.

import { isBlankText } from "@/lib/esg/format";
import { formText } from "@/lib/validation";

export type OrgProfileKey =
  | "phone"
  | "website"
  | "address1"
  | "address2"
  | "city"
  | "state"
  | "postalCode"
  | "country"
  | "overview";

export type OrgProfile = Record<OrgProfileKey, string | null>;

export const ORG_PROFILE_FIELDS: {
  key: OrgProfileKey;
  label: string;
  // ESG Part I narrative key this field fills when the event leaves it blank.
  esgKey: string;
  kind: "text" | "url" | "tel" | "richtext";
  wide?: boolean;
}[] = [
  { key: "phone", label: "Phone", esgKey: "hostOrgPhone", kind: "tel" },
  { key: "website", label: "Website", esgKey: "hostOrgWebsite", kind: "url" },
  { key: "address1", label: "Mailing address line 1", esgKey: "hostOrgAddress1", kind: "text", wide: true },
  { key: "address2", label: "Mailing address line 2", esgKey: "hostOrgAddress2", kind: "text", wide: true },
  { key: "city", label: "City", esgKey: "hostOrgCity", kind: "text" },
  { key: "state", label: "State / province", esgKey: "hostOrgState", kind: "text" },
  { key: "postalCode", label: "Postal / ZIP code", esgKey: "hostOrgPostalCode", kind: "text" },
  { key: "country", label: "Country", esgKey: "hostOrgCountry", kind: "text" },
  { key: "overview", label: "Overview (mission, philosophy)", esgKey: "hostOrgOverview", kind: "richtext", wide: true },
];

export const orgProfileSelect = {
  phone: true,
  website: true,
  address1: true,
  address2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  overview: true,
} as const;

export function orgProfileFromForm(formData: FormData): OrgProfile {
  const profile = {} as OrgProfile;
  for (const f of ORG_PROFILE_FIELDS) {
    // Bounded like any form field: a refusal names the field.
    const raw = formText(formData, f.key, { label: f.label, max: f.kind === "richtext" ? 100_000 : 1_000 });
    profile[f.key] = f.kind === "richtext" && raw && isBlankText(raw) ? null : raw;
  }
  return profile;
}

// ESG narrative defaults keyed by narrative key: the organization's name plus
// every filled profile field.
export function orgEsgDefaults(tenant: ({ name: string } & OrgProfile) | null): Record<string, string> {
  if (!tenant) return {};
  const out: Record<string, string> = { hostOrgName: tenant.name };
  for (const f of ORG_PROFILE_FIELDS) {
    const v = tenant[f.key];
    if (v) out[f.esgKey] = v;
  }
  return out;
}

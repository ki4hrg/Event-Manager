// Booth groups hold the settings a set of booths shares. Every key below
// exists on both ExhibitBooth and ExhibitBoothGroup; a booth's own non-null
// value wins, otherwise its group's applies. Times still left empty after
// that follow the exhibit function's schedule (see the ESG assembler).

import type { ExhibitBooth, ExhibitBoothGroup } from "@prisma/client";

export const BOOTH_SHARED_KEYS = [
  "functionId",
  "location",
  "boothType",
  "startAt",
  "endAt",
  "setupBy",
  "teardownBy",
  "specialRequirements",
  "setupNotes",
  "avProvider",
  "avNotes",
  "fbNotes",
  "decorNotes",
  "securityNotes",
  "signageNotes",
  "shippingRequired",
  "customsRequired",
  "materialHandlingNotes",
  "electricalProvider",
  "electricalNotes",
  "utilitiesNotes",
  "taxExempt",
  "taxExemptId",
  "costCenter",
  "billingNotes",
] as const satisfies readonly (keyof ExhibitBooth & keyof ExhibitBoothGroup)[];

export type BoothSharedKey = (typeof BOOTH_SHARED_KEYS)[number];
export type BoothShared = Pick<ExhibitBooth, BoothSharedKey>;

// The booth with its group's values filled into the keys it leaves blank.
export function withGroupDefaults<B extends BoothShared>(booth: B, group: BoothShared | null | undefined): B {
  if (!group) return booth;
  const out: Record<string, unknown> = { ...booth };
  for (const k of BOOTH_SHARED_KEYS) if (out[k] === null || out[k] === undefined) out[k] = group[k];
  return out as B;
}

// ESG "Not Required / Group To Provide / Venue To Provide / Outside Vendor To
// Provide", derived from an order's vendor assignments: the system vendor is
// the group's own team, a venue-linked vendor is the venue, anyone else is an
// outside vendor (named). Several vendors give several concrete segments —
// never a "Multiple" rollup.

import type { ProvidedBy } from "@prisma/client";
import { PROVIDED_BY_LABELS } from "@/lib/esg/apex";

export type ProvidedByVendor = { name: string; isSystemVendor: boolean; venueId: string | null };

export type ProvidedBySegment = { kind: ProvidedBy; name: string | null };

export function deriveProvidedBy(vendors: ProvidedByVendor[]): ProvidedBySegment[] {
  if (vendors.length === 0) return [{ kind: "NOT_REQUIRED", name: null }];
  return vendors.map((v) => {
    if (v.isSystemVendor) return { kind: "GROUP", name: null };
    if (v.venueId) return { kind: "VENUE", name: v.name };
    return { kind: "OUTSIDE_VENDOR", name: v.name };
  });
}

export function formatProvidedBy(segments: ProvidedBySegment[]): string {
  return segments
    .map((s) => (s.name ? `${PROVIDED_BY_LABELS[s.kind]} (${s.name})` : PROVIDED_BY_LABELS[s.kind]))
    .join("; ");
}

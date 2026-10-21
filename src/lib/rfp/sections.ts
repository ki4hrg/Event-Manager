// The optional parts of an RFP document. Rfp.sections stores the keys that
// are on; contact information, event profile, statement of need, dates and
// proposal specifications always print. Pure, so client forms can import it.

import type { RfpKind } from "@prisma/client";

export type RfpSection = "blocks" | "lineItems" | "meetingSpace" | "fb" | "concessions" | "history" | "requirements" | "responseForm";

const ALL: RfpKind[] = ["HOTEL", "AV", "CATERING", "PRINT", "OTHER"];
const VENDOR: RfpKind[] = ["AV", "CATERING", "PRINT", "OTHER"];

// label: as the hotel RFP names the part; vendorLabel where a vendor RFP differs.
export const RFP_SECTIONS: { key: RfpSection; label: string; vendorLabel?: string; kinds: RfpKind[] }[] = [
  { key: "blocks", label: "Room blocks", kinds: ["HOTEL"] },
  { key: "lineItems", label: "Line items", kinds: VENDOR },
  { key: "meetingSpace", label: "Function space", kinds: ["HOTEL"] },
  { key: "fb", label: "Food & beverage", kinds: ["HOTEL"] },
  { key: "concessions", label: "Concessions", vendorLabel: "Terms", kinds: ALL },
  { key: "history", label: "Event history", kinds: ["HOTEL"] },
  { key: "requirements", label: "Other requirements", kinds: ALL },
  { key: "responseForm", label: "Response form", kinds: ALL },
];

export function sectionsFor(kind: RfpKind) {
  return RFP_SECTIONS.filter((s) => s.kinds.includes(kind)).map((s) => ({ ...s, label: kind !== "HOTEL" && s.vendorLabel ? s.vendorLabel : s.label }));
}

// Keeps only keys the kind allows, in RFP_SECTIONS order.
export function parseSections(kind: RfpKind, raw: string[]): RfpSection[] {
  const on = new Set(raw);
  return sectionsFor(kind)
    .filter((s) => on.has(s.key))
    .map((s) => s.key);
}

// The "none" value of the RFP form's selects; the action reads it as null.
export const BLANK = "__blank__";

export const RFP_STATUS_LABELS = { DRAFT: "Draft", ISSUED: "Issued", CLOSED: "Closed" } as const;
export const RFP_STATUS_COLORS = { DRAFT: "gray", ISSUED: "blue", CLOSED: "green" } as const;

// rfp_concession option groups: the APEX RFP's "Concessions Desired" headings.
export type ConcessionGroup = "ROOMS" | "FB" | "OTHER";
export const CONCESSION_GROUPS: { value: ConcessionGroup; label: string }[] = [
  { value: "ROOMS", label: "Guest rooms" },
  { value: "FB", label: "Food & beverage" },
  { value: "OTHER", label: "Other" },
];
// An option's group, or OTHER for free text and ungrouped options.
export const concessionGroupOf = (group: string | null | undefined): ConcessionGroup =>
  group === "ROOMS" || group === "FB" ? group : "OTHER";

// What an RFP's F&B minimum includes (Rfp.fbIncludes).
export const FB_INCLUDES = [
  { value: "TAX", label: "Tax" },
  { value: "SERVICE", label: "Service charge" },
  { value: "GRATUITY", label: "Gratuity" },
] as const;

export const SPACE_KIND_LABELS = { MEETING: "Meeting space", FB: "Food & beverage" } as const;

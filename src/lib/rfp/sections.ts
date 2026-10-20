// The optional parts of an RFP document. Rfp.sections stores the keys that
// are on; the cover (event, dates, due date, contact, introduction) always
// prints. Pure, so client forms can import it.

import type { RfpKind } from "@prisma/client";

export type RfpSection = "blocks" | "meetingSpace" | "fb" | "concessions" | "history" | "requirements";

export const RFP_SECTIONS: { key: RfpSection; label: string; kinds: RfpKind[] }[] = [
  { key: "blocks", label: "Room blocks", kinds: ["HOTEL"] },
  { key: "meetingSpace", label: "Meeting space", kinds: ["HOTEL"] },
  { key: "fb", label: "Food & beverage", kinds: ["HOTEL"] },
  { key: "concessions", label: "Concessions", kinds: ["HOTEL"] },
  { key: "history", label: "Event history", kinds: ["HOTEL"] },
  { key: "requirements", label: "Additional requirements", kinds: ["HOTEL"] },
];

export function sectionsFor(kind: RfpKind) {
  return RFP_SECTIONS.filter((s) => s.kinds.includes(kind));
}

// Keeps only keys the kind allows, in RFP_SECTIONS order.
export function parseSections(kind: RfpKind, raw: string[]): RfpSection[] {
  const on = new Set(raw);
  return sectionsFor(kind)
    .filter((s) => on.has(s.key))
    .map((s) => s.key);
}

export const RFP_STATUS_LABELS = { DRAFT: "Draft", ISSUED: "Issued", CLOSED: "Closed" } as const;
export const RFP_STATUS_COLORS = { DRAFT: "gray", ISSUED: "blue", CLOSED: "green" } as const;

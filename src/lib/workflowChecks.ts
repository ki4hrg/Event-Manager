// Automatic checks a workflow step can complete on (completionMode AUTO, or
// PROMPT for a confirm once it holds). The registry is closed: a step's
// `computedKey` names one of these, and an unknown key reads as no check.
// Pure, so the template editor can offer the list; the per-record values are
// loaded by loadWorkflowChecks (src/lib/workflowCheckData.ts).
//
// A check's value is computed on every read, so dots, strips and counts can't
// drift. The one stored thing that can go stale is the record's status, which
// follows its current step: every core that writes what a check reads calls
// refreshWorkflowStatus (src/app/events/workflows/core.ts) after it commits.
// `writes` names those writes, so a reviewer can hold a new one to the list.

import type { WorkflowEntityType } from "@/app/events/workflows/entity-types";

export const WORKFLOW_CHECK_KEYS = [
  "VENDOR_ASSIGNED",
  "LINKED_TO_FUNCTION",
  "SCHEDULED",
  "ITEMS_ENTERED",
  "EXPECTED_COUNT_SET",
  "CONFIRMED_COUNT_SET",
  "GUARANTEE_SET",
  "ACTUAL_COUNT_SET",
  "ATTENDANCE_SET",
  "SET_FOR_SET",
  "ACTUAL_ATTENDANCE_SET",
  "RFP_ISSUED",
  "QUOTES_IN",
  "AWARDED",
] as const;

export type WorkflowCheckKey = (typeof WORKFLOW_CHECK_KEYS)[number];

type CheckDef = {
  label: string; // the editor's name for it
  pending: string; // the strip's state line while it doesn't hold
  appliesTo: readonly WorkflowEntityType[];
  writes: string; // the writes that can change it (each calls refreshWorkflowStatus)
};

const ORDERS = ["av_order", "catering_order", "setup_order", "print_order", "supply_order"] as const;
const RFP_ORDERS = ["av_order", "catering_order", "print_order"] as const;

export const WORKFLOW_CHECKS: Record<WorkflowCheckKey, CheckDef> = {
  VENDOR_ASSIGNED: {
    label: "Vendor assigned",
    pending: "No vendor yet",
    appliesTo: [...ORDERS, "media_deliverable"],
    writes: "order vendor junctions (add/remove/replace, bulk), supply/media provider, RFP awards",
  },
  LINKED_TO_FUNCTION: {
    label: "Linked to a function",
    pending: "Not linked",
    appliesTo: [...ORDERS, "media_deliverable"],
    writes: "order ↔ function links (link/unlink, bulk), catering functionId, function delete",
  },
  SCHEDULED: {
    label: "Scheduled (room and time)",
    pending: "Not scheduled",
    appliesTo: ["function", ...ORDERS],
    writes: "function schedules and rooms, function ↔ order links",
  },
  ITEMS_ENTERED: {
    label: "Items entered",
    pending: "No items yet",
    appliesTo: ORDERS,
    writes: "equipment items, catering line items / menu sections, setup tables / details, print items, supply items",
  },
  // One per count, named after its field (Guest Counts card, function ESG
  // card), so a step says which number it waits on.
  EXPECTED_COUNT_SET: {
    label: "Expected count set",
    pending: "No expected count",
    appliesTo: ["catering_order"],
    writes: "catering order guest counts",
  },
  CONFIRMED_COUNT_SET: {
    label: "Confirmed count set",
    pending: "No confirmed count",
    appliesTo: ["catering_order"],
    writes: "catering order guest counts",
  },
  GUARANTEE_SET: {
    label: "Guarantee set",
    pending: "No guarantee",
    appliesTo: ["catering_order"],
    writes: "catering order guest counts",
  },
  ACTUAL_COUNT_SET: {
    label: "Actual count (# fed) set",
    pending: "No actual count",
    appliesTo: ["catering_order"],
    writes: "catering order guest counts",
  },
  ATTENDANCE_SET: {
    label: "Attendance set",
    pending: "No attendance",
    appliesTo: ["function"],
    writes: "function ESG details",
  },
  SET_FOR_SET: {
    label: "Set-for count set",
    pending: "No set-for count",
    appliesTo: ["function"],
    writes: "function ESG details",
  },
  ACTUAL_ATTENDANCE_SET: {
    label: "Actual attendance set",
    pending: "No actual attendance",
    appliesTo: ["function"],
    writes: "function ESG details",
  },
  RFP_ISSUED: {
    label: "RFP issued",
    pending: "Not on an issued RFP",
    appliesTo: RFP_ORDERS,
    writes: "RFP line items (fill / set), RFP status (issue, close)",
  },
  QUOTES_IN: {
    label: "Quotes in",
    pending: "No quotes yet",
    appliesTo: RFP_ORDERS,
    writes: "vendor quotes (record, update, delete)",
  },
  AWARDED: {
    label: "Awarded",
    pending: "Not awarded",
    appliesTo: RFP_ORDERS,
    writes: "RFP line awards (award, clear, no award)",
  },
};

export function isWorkflowCheckKey(key: string | null | undefined): key is WorkflowCheckKey {
  return key != null && (WORKFLOW_CHECK_KEYS as readonly string[]).includes(key);
}

// The checks a template can use: those that apply to every record type it is
// the default for (all of them when it isn't a default for any).
export function checksForEntityTypes(types: readonly string[]): WorkflowCheckKey[] {
  return WORKFLOW_CHECK_KEYS.filter((k) => types.every((t) => (WORKFLOW_CHECKS[k].appliesTo as readonly string[]).includes(t)));
}

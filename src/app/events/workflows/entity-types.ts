// The workflow entity vocabulary and its mapping to PermissionResource.
// Deliberately free of prisma and "use server" so client panels — the status
// panel and the workflow panel, which both receive an entityType string — can
// resolve their own resource instead of taking a redundant prop.

import type { PermissionResource } from "@prisma/client";

export type WorkflowEntityType =
  | "function"
  | "catering_order"
  | "av_order"
  | "print_order"
  | "presentation"
  | "setup_order"
  | "supply_order"
  | "media_deliverable"
  | "form_submission";

export const ENTITY_TYPE_RESOURCE: Record<WorkflowEntityType, PermissionResource> = {
  function: "FUNCTIONS",
  catering_order: "CATERING_ORDERS",
  av_order: "AV_ORDERS",
  print_order: "PRINT_ORDERS",
  presentation: "PRESENTATIONS",
  setup_order: "SETUP_ORDERS",
  supply_order: "SUPPLY_ORDERS",
  media_deliverable: "MEDIA_DELIVERABLES",
  form_submission: "FORMS",
};

/** Whether a client-supplied string names a workflow entity type. */
export function isWorkflowEntityType(v: unknown): v is WorkflowEntityType {
  return typeof v === "string" && Object.hasOwn(ENTITY_TYPE_RESOURCE, v);
}

// Display labels, in the order the workflow editor offers them. A Record so a
// new entity type can't ship without being offered for auto-assignment.
export const WORKFLOW_ENTITY_LABELS: Record<WorkflowEntityType, string> = {
  function: "Function",
  presentation: "Presentation",
  catering_order: "Catering Order",
  av_order: "AV Order",
  setup_order: "Setup Order",
  print_order: "Print Order",
  supply_order: "Supply Order",
  media_deliverable: "Media Deliverable",
  form_submission: "Form Submission",
};

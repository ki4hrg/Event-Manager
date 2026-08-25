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
  | "media_deliverable";

export const ENTITY_TYPE_RESOURCE: Record<WorkflowEntityType, PermissionResource> = {
  function: "FUNCTIONS",
  catering_order: "CATERING_ORDERS",
  av_order: "AV_ORDERS",
  print_order: "PRINT_ORDERS",
  presentation: "PRESENTATIONS",
  setup_order: "SETUP_ORDERS",
  supply_order: "SUPPLY_ORDERS",
  media_deliverable: "MEDIA_DELIVERABLES",
};

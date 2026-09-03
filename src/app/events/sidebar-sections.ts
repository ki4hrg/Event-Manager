// Sidebar section vocabulary. Deliberately NOT a "use server" file: every
// export from one of those becomes an RPC endpoint and must be an async
// function, so the section->resource map can't live alongside the action that
// uses it. The event layout also reads this to decide which sections to render.

import type { PermissionResource } from "@prisma/client";

export type SidebarSection =
  | "functions"
  | "presentations"
  | "media-deliverables"
  | "av-orders"
  | "catering-orders"
  | "print-orders"
  | "setup-orders"
  | "supply-orders";

// Each section lists one entity type, so it is gated on that entity's own VIEW
// rather than on EVENTS — a user who can open an event but has no access to,
// say, supply orders must not see or enumerate them.
export const SECTION_RESOURCE: Record<SidebarSection, PermissionResource> = {
  functions: "FUNCTIONS",
  presentations: "PRESENTATIONS",
  "media-deliverables": "MEDIA_DELIVERABLES",
  "av-orders": "AV_ORDERS",
  "catering-orders": "CATERING_ORDERS",
  "print-orders": "PRINT_ORDERS",
  "setup-orders": "SETUP_ORDERS",
  "supply-orders": "SUPPLY_ORDERS",
};

export const SIDEBAR_SECTIONS = Object.keys(SECTION_RESOURCE) as SidebarSection[];

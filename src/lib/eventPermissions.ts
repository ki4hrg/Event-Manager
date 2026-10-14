// Client-importable half of the read-only UI gating. No "use server" and no
// imports from @/lib/permissions (which pulls in auth() and next/navigation),
// so `"use client"` panels can import the type and the comparison helper while
// the server resolves the actual levels.
//
// The server enforces every mutation on its own — see § Server Actions in
// CLAUDE.md. This map exists so the UI stops OFFERING actions the server will
// refuse; it is a display concern, never the access control itself.

import type { PermissionLevel, PermissionResource } from "@prisma/client";

export type PermissionMap = Partial<Record<PermissionResource, PermissionLevel>>;

const LEVEL_ORDER: Record<PermissionLevel, number> = {
  NONE: 0,
  VIEW: 1,
  WRITE: 2,
  DELETE: 3,
};

// Resources whose grants carry ASSIGNED / UNASSIGNED rows, so they must be
// resolved WITH the event id. Mirrors the EVENT_RESOURCES list in
// prisma/seed.mjs and EVENT_SCOPED_RESOURCES in src/app/users/roles/resources.ts
// — when a PermissionResource becomes event-scoped, add it to all three.
export const EVENT_SCOPED_PERMISSION_RESOURCES: PermissionResource[] = [
  "EVENTS",
  "FUNCTIONS",
  "PRESENTATIONS",
  "AV_ORDERS",
  "CATERING_ORDERS",
  "SETUP_ORDERS",
  "PRINT_ORDERS",
  "SUPPLY_ORDERS",
  "MEDIA_DELIVERABLES",
  "FILES",
  "SHARE_LINKS",
  "HOTELS",
];

// Global catalogs that event pages nonetheless read: order forms carry a vendor
// picker, contact panels write a Contact, detail pages assign workflows. These
// have ONLY a GLOBAL row (see buildPermissions in prisma/seed.mjs), so passing
// an event id resolves them at ASSIGNED scope, finds nothing, and reports NONE
// — which is how the event sidebar's Vendors link came to be hidden from
// everyone. Resolve them at GLOBAL scope instead.
export const GLOBAL_PERMISSION_RESOURCES: PermissionResource[] = [
  "VENDORS",
  "CONTACTS",
  "WORKFLOWS",
];

// The standalone catalog sections outside any event. Same provider, no event id.
export const CATALOG_PERMISSION_RESOURCES: PermissionResource[] = [
  "VENDORS",
  "VENUES",
  "CONTACTS",
];

export function canDo(
  map: PermissionMap,
  resource: PermissionResource,
  action: Exclude<PermissionLevel, "NONE">,
): boolean {
  return LEVEL_ORDER[map[resource] ?? "NONE"] >= LEVEL_ORDER[action];
}

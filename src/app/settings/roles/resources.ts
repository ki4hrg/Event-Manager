import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";

type ResourceEntry = { value: PermissionResource; label: string };

const GLOBAL_ONLY_RESOURCES: ResourceEntry[] = [
  { value: PermissionResource.ROLES, label: "Roles" },
  { value: PermissionResource.USERS, label: "Users" },
  { value: PermissionResource.SETTINGS, label: "Settings" },
  { value: PermissionResource.WORKFLOWS, label: "Workflows" },
  { value: PermissionResource.VENDORS, label: "Vendors" },
  { value: PermissionResource.VENUES, label: "Venues" },
  { value: PermissionResource.CONTACTS, label: "Contacts" },
  // API_KEYS exists in the enum but is intentionally absent here — API keys are
  // self-service per-user under /account/api-keys and don't need a role gate.
];

const EVENT_SCOPED_RESOURCES: ResourceEntry[] = [
  { value: PermissionResource.EVENTS, label: "Events" },
  { value: PermissionResource.FUNCTIONS, label: "Functions" },
  { value: PermissionResource.PRESENTATIONS, label: "Presentations" },
  { value: PermissionResource.AV_ORDERS, label: "AV Orders" },
  { value: PermissionResource.CATERING_ORDERS, label: "Catering Orders" },
  { value: PermissionResource.SETUP_ORDERS, label: "Setup Orders" },
  { value: PermissionResource.PRINT_ORDERS, label: "Print Orders" },
  { value: PermissionResource.SUPPLY_ORDERS, label: "Supply Orders" },
  { value: PermissionResource.MEDIA_DELIVERABLES, label: "Media Deliverables" },
  { value: PermissionResource.FILES, label: "Files" },
  { value: PermissionResource.SHARE_LINKS, label: "Share Links" },
];

// Single source of truth for the resource × scope matrix used by both the form
// renderer and the action parser. Mirrors the seed in prisma/seed.mjs — when
// adding a PermissionResource, update both files (seed.mjs cannot import this).
export const PERMISSION_GROUPS: {
  label: string;
  resources: ResourceEntry[];
  scopes: PermissionScope[];
}[] = [
  {
    label: "Global resources",
    resources: GLOBAL_ONLY_RESOURCES,
    scopes: [PermissionScope.GLOBAL],
  },
  {
    label: "Event-scoped resources",
    resources: EVENT_SCOPED_RESOURCES,
    scopes: [PermissionScope.GLOBAL, PermissionScope.ASSIGNED, PermissionScope.UNASSIGNED],
  },
];

export const PERMISSION_LEVELS: { value: PermissionLevel; label: string }[] = [
  { value: PermissionLevel.NONE, label: "None" },
  { value: PermissionLevel.VIEW, label: "View" },
  { value: PermissionLevel.WRITE, label: "Write" },
  { value: PermissionLevel.DELETE, label: "Delete" },
];

export const EVENT_SCOPES: { value: PermissionScope; label: string }[] = [
  { value: PermissionScope.GLOBAL, label: "Global" },
  { value: PermissionScope.ASSIGNED, label: "Assigned" },
  { value: PermissionScope.UNASSIGNED, label: "Unassigned" },
];

// Name of the seeded default role assigned to new users when no role is specified.
export const DEFAULT_ROLE_NAME = "User";

export function permissionFieldName(resource: PermissionResource, scope: PermissionScope) {
  return `permission:${resource}:${scope}`;
}

import { PermissionLevel, PermissionResource, PermissionScope } from "@prisma/client";

type ResourceEntry = { value: PermissionResource; label: string };

const GLOBAL_ONLY_RESOURCES: ResourceEntry[] = [
  { value: PermissionResource.ROLES, label: "Roles" },
  { value: PermissionResource.USERS, label: "Users" },
  { value: PermissionResource.SETTINGS, label: "Settings" },
  { value: PermissionResource.SYSTEM, label: "System" },
  { value: PermissionResource.EQUIPMENT, label: "Equipment" },
  // Unlike the other global catalogs, STORAGE_LOCATIONS is granted to the
  // default User role (WRITE) by the seed. Load-out is the reason: boxes get
  // added and re-placed on the pallet in the field, by whoever is packing.
  // DELETE stays admin-only, so packers archive rather than remove.
  { value: PermissionResource.STORAGE_LOCATIONS, label: "Storage Locations" },
  { value: PermissionResource.WORKFLOWS, label: "Workflows" },
  { value: PermissionResource.VENDORS, label: "Vendors" },
  { value: PermissionResource.VENUES, label: "Venues" },
  { value: PermissionResource.CONTACTS, label: "Contacts" },
  // API_KEYS gates the /users/api-keys admin master list (view + revoke any
  // user's key). Minting stays self-service under /account/api-keys and does
  // not consult this permission. Granting API_KEYS to a non-admin role gives
  // them ability to audit and revoke keys without other admin powers.
  { value: PermissionResource.API_KEYS, label: "API Keys" },
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
  { value: PermissionResource.HOTELS, label: "Hotels" },
  { value: PermissionResource.FORMS, label: "Forms" },
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

// Column headers for the permission matrix. Named for what they control rather
// than for the enum: on an event-scoped resource GLOBAL does not mean "all
// events", it means "may open this section at all" — reading it as the former
// leads an admin to set it NONE for a restricted role and lock the user out of
// their own events entirely.
export const EVENT_SCOPES: { value: PermissionScope; label: string }[] = [
  { value: PermissionScope.GLOBAL, label: "Section" },
  { value: PermissionScope.ASSIGNED, label: "Assigned events" },
  { value: PermissionScope.UNASSIGNED, label: "Other events" },
];

// Name of the seeded default role assigned to new users when no role is specified.
export const DEFAULT_ROLE_NAME = "User";

export function permissionFieldName(resource: PermissionResource, scope: PermissionScope) {
  return `permission:${resource}:${scope}`;
}

// Resources a role has no stored level for at one of its scopes — added after
// the role was last saved. They read as NONE, so a custom role's users quietly
// lose the section; /users/roles flags them. System roles are rewritten by the
// seed and never have gaps.
export function unsetResources(perms: { resource: PermissionResource; scope: PermissionScope }[]): ResourceEntry[] {
  const set = new Set(perms.map((p) => `${p.resource}:${p.scope}`));
  return PERMISSION_GROUPS.flatMap((g) => g.resources.filter((r) => g.scopes.some((s) => !set.has(`${r.value}:${s}`))));
}

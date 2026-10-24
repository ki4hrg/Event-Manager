// The admin area: which admin pages a user may open, for the grouped admin nav
// and the header's Admin link (the first of them). Every page still checks its
// own permission in its layout; this only decides what to link.
//
// Server module (it reads the option-category registry); callers resolve the
// user's levels and pass them in.

import { PermissionResource } from "@prisma/client";
import type { SideNavGroup, SideNavLink } from "@/components/SideNav";
import {
  OPTION_CATEGORIES,
  OPTION_SECTIONS,
  SECTION_KEYS,
  categoriesInSection,
  optionListHref,
  type OptionCategory,
  type OptionCategoryDef,
} from "@/lib/optionCategories";

export type AdminNavLink = SideNavLink;
// "page" groups are admin pages (Organization, Access, System); "list"
// groups are functional areas of option lists. The nav renders them apart.
export type AdminNavGroup = SideNavGroup & { kind: "page" | "list" };

// Who can open what: a resource's GLOBAL view, or super admin for /tenants.
export type AdminAccess = {
  canView: (resource: PermissionResource) => boolean;
  isSuperAdmin: boolean;
};

// Every resource the admin pages and lists gate on, for callers resolving levels.
export const ADMIN_RESOURCES: PermissionResource[] = [
  PermissionResource.SETTINGS,
  PermissionResource.WORKFLOWS,
  PermissionResource.EQUIPMENT,
  PermissionResource.STORAGE_LOCATIONS,
  PermissionResource.USERS,
  PermissionResource.ROLES,
  PermissionResource.API_KEYS,
  PermissionResource.SYSTEM,
];

const page = (label: string, href: string) => ({ label, href });

export const ADMIN_PAGES = {
  settings: page("Settings", "/settings"),
  organization: page("Organization", "/settings/organization"),
  workflows: page("Workflows", "/workflows"),
  users: page("Users", "/users"),
  roles: page("Roles", "/users/roles"),
  apiKeys: page("API Keys", "/users/api-keys"),
  system: page("System", "/system"),
  tenants: page("Organizations", "/tenants"),
} as const;

// A list's nav link: its page under /settings.
function listLink(category: OptionCategory, { canView }: AdminAccess): AdminNavLink | null {
  const def: OptionCategoryDef = OPTION_CATEGORIES[category];
  return canView(PermissionResource.SETTINGS) && canView(def.resource) ? page(def.title, optionListHref(category)) : null;
}

// The admin nav: the admin pages (Organization, Workflows, Access, System),
// then one group per functional area holding its lists (from the registry).
// Groups left with no visible link drop out.
export function adminNavGroups(access: AdminAccess): AdminNavGroup[] {
  const { canView, isSuperAdmin } = access;
  const settings = canView(PermissionResource.SETTINGS);
  const areaGroups: AdminNavGroup[] = SECTION_KEYS.map((s) => {
    const lists = categoriesInSection(s)
      .map((c) => listLink(c, access))
      .filter((l): l is AdminNavLink => !!l);
    return { label: OPTION_SECTIONS[s].title, kind: "list" as const, links: lists };
  });
  const groups: AdminNavGroup[] = [
    { label: "Organization", kind: "page", links: settings ? [ADMIN_PAGES.organization] : [] },
    { label: "Workflows", kind: "page", links: canView(PermissionResource.WORKFLOWS) ? [ADMIN_PAGES.workflows] : [] },
    {
      label: "Access",
      kind: "page",
      links: [
        canView(PermissionResource.USERS) && ADMIN_PAGES.users,
        canView(PermissionResource.ROLES) && ADMIN_PAGES.roles,
        canView(PermissionResource.API_KEYS) && ADMIN_PAGES.apiKeys,
      ].filter((l): l is AdminNavLink => !!l),
    },
    {
      label: "System",
      kind: "page",
      links: [
        canView(PermissionResource.SYSTEM) && ADMIN_PAGES.system,
        isSuperAdmin && ADMIN_PAGES.tenants,
      ].filter((l): l is AdminNavLink => !!l),
    },
    ...areaGroups,
  ];
  return groups.filter((g) => g.links.length > 0);
}

// The header's Admin link: the first admin page the user can open, or none.
// Every admin page is in the admin nav, so the header carries just the entry.
export function adminHomeHref(access: AdminAccess): string | null {
  return adminNavGroups(access)[0]?.links[0]?.href ?? null;
}

// The inventory area's nav (InventoryShell): the equipment catalog, then the
// storage locations. Their option lists live in Settings.
export function inventoryNavGroups({ canView }: Pick<AdminAccess, "canView">): SideNavGroup[] {
  const groups: SideNavGroup[] = [
    { label: "Equipment Items", links: canView(PermissionResource.EQUIPMENT) ? [page("Equipment Items", "/equipment/items")] : [] },
    {
      label: "Inventory",
      links: canView(PermissionResource.STORAGE_LOCATIONS) ? [page("Storage Locations", "/storage-locations/locations")] : [],
    },
  ];
  return groups.filter((g) => g.links.length > 0);
}

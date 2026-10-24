// The admin area: which admin pages a user may open, for the header's Admin
// links and the grouped settings nav. Both read this one map, so a page added
// here appears in each with the same label and the same gate. Every page still
// checks its own permission in its layout; this only decides what to link.
//
// Server module (it reads the option-category registry); callers resolve the
// user's levels and pass them in.

import { PermissionResource } from "@prisma/client";
import {
  OPTION_CATEGORIES,
  OPTION_SECTIONS,
  SECTION_KEYS,
  categoriesInSection,
  optionListHref,
  type OptionCategory,
  type OptionCategoryDef,
} from "@/lib/optionCategories";

export type AdminNavLink = { label: string; href: string };
export type AdminNavGroup = { label: string; links: AdminNavLink[] };

// Who can open what: a resource's GLOBAL view, or super admin for /tenants.
export type AdminAccess = {
  canView: (resource: PermissionResource) => boolean;
  isSuperAdmin: boolean;
};

// Every resource the admin pages gate on, for callers resolving levels.
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
  equipment: page("Equipment", "/equipment"),
  users: page("Users", "/users"),
  roles: page("Roles", "/users/roles"),
  apiKeys: page("API Keys", "/users/api-keys"),
  system: page("System", "/system"),
  tenants: page("Organizations", "/tenants"),
} as const;

// The header's Admin links. /users lets in any of its three resources.
export function adminHeaderLinks({ canView, isSuperAdmin }: AdminAccess): AdminNavLink[] {
  return [
    (canView(PermissionResource.USERS) || canView(PermissionResource.ROLES) || canView(PermissionResource.API_KEYS)) &&
      ADMIN_PAGES.users,
    canView(PermissionResource.EQUIPMENT) && ADMIN_PAGES.equipment,
    canView(PermissionResource.SETTINGS) && ADMIN_PAGES.settings,
    canView(PermissionResource.SYSTEM) && ADMIN_PAGES.system,
    canView(PermissionResource.WORKFLOWS) && ADMIN_PAGES.workflows,
    isSuperAdmin && ADMIN_PAGES.tenants,
  ].filter((l): l is AdminNavLink => !!l);
}

// A list's nav link: its page under /settings, or, for a user who can't open
// /settings, the page hosting it in its own feature (none for most lists).
function listLink(category: OptionCategory, { canView }: AdminAccess): AdminNavLink | null {
  const def: OptionCategoryDef = OPTION_CATEGORIES[category];
  if (!canView(def.resource)) return null;
  if (canView(PermissionResource.SETTINGS)) return page(def.title, optionListHref(category));
  return def.host ? page(def.title, def.host) : null;
}

// The admin nav: Organization, one group per functional area holding its
// lists (from the registry), then Access and System. Groups left with no
// visible link drop out.
export function adminNavGroups(access: AdminAccess): AdminNavGroup[] {
  const { canView, isSuperAdmin } = access;
  const settings = canView(PermissionResource.SETTINGS);
  const areaGroups: AdminNavGroup[] = SECTION_KEYS.map((s) => {
    const lists = categoriesInSection(s)
      .map((c) => listLink(c, access))
      .filter((l): l is AdminNavLink => !!l);
    // Workflows set the statuses the substatus lists refine.
    const extra = s === "status" && canView(PermissionResource.WORKFLOWS) ? [ADMIN_PAGES.workflows] : [];
    return { label: OPTION_SECTIONS[s].title, links: [...lists, ...extra] };
  });
  const groups: AdminNavGroup[] = [
    { label: "Organization", links: settings ? [ADMIN_PAGES.organization] : [] },
    ...areaGroups,
    {
      label: "Access",
      links: [
        canView(PermissionResource.USERS) && ADMIN_PAGES.users,
        canView(PermissionResource.ROLES) && ADMIN_PAGES.roles,
        canView(PermissionResource.API_KEYS) && ADMIN_PAGES.apiKeys,
      ].filter((l): l is AdminNavLink => !!l),
    },
    {
      label: "System",
      links: [
        canView(PermissionResource.SYSTEM) && ADMIN_PAGES.system,
        isSuperAdmin && ADMIN_PAGES.tenants,
      ].filter((l): l is AdminNavLink => !!l),
    },
  ];
  return groups.filter((g) => g.links.length > 0);
}

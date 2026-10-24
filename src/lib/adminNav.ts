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
  SETTINGS_SECTIONS,
  categoriesInSection,
  type OptionSection,
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

// The settings nav, grouped as in the settings epic (#190). Option-list
// sections come from the registry; groups left with no visible link drop out.
export function adminNavGroups({ canView, isSuperAdmin }: AdminAccess): AdminNavGroup[] {
  const settings = canView(PermissionResource.SETTINGS);
  const section = (s: OptionSection) => page(OPTION_SECTIONS[s].title, OPTION_SECTIONS[s].href);
  // Lists edited outside Settings (equipment categories, location types),
  // each gated on its own lists' resource like the page that hosts it.
  const inventory = (Object.keys(OPTION_SECTIONS) as OptionSection[]).filter(
    (s) => !OPTION_SECTIONS[s].settings && categoriesInSection(s).every((c) => canView(OPTION_CATEGORIES[c].resource)),
  );
  const sectionGroups: AdminNavGroup[] = SETTINGS_SECTIONS.map((s) => {
    // Workflows set the statuses the status lists refine.
    const extra = s === "status" && canView(PermissionResource.WORKFLOWS) ? [ADMIN_PAGES.workflows] : [];
    // A section alone is one link under its own name; beside other pages it's "Lists".
    const lists = settings ? [extra.length ? page("Lists", OPTION_SECTIONS[s].href) : section(s)] : [];
    return { label: OPTION_SECTIONS[s].title, links: [...lists, ...extra] };
  });
  const groups: AdminNavGroup[] = [
    { label: "Organization", links: settings ? [ADMIN_PAGES.organization] : [] },
    ...sectionGroups,
    {
      label: "Inventory",
      links: inventory.map(section),
    },
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

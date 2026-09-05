import { auth, signOut } from "@/lib/auth";
import Link from "next/link";
import { PermissionResource } from "@prisma/client";
import { hasGlobalView, loadPermissionsForUser, type PermissionGrant } from "@/lib/permissions";
import { getTenantContext } from "@/lib/tenant";
import { AdminDropdown } from "./AdminDropdown";
import { TenantSwitcher } from "./TenantSwitcher";

export async function Header() {
  const session = await auth();
  const ctx = await getTenantContext();
  // No active tenant (an account with no memberships yet) renders a bare
  // header: nothing to navigate to, but account and sign-out still work.
  const permissions: PermissionGrant[] =
    ctx?.active ? (await loadPermissionsForUser(ctx.userId, ctx.active.id)).permissions : [];
  const isSuperAdmin = ctx?.isSuperAdmin ?? false;

  // Main-nav links are gated the same way the Admin dropdown already was.
  // An ungated link is worse than a missing one: clicking it bounces the user
  // to "/" with no explanation, which reads as the app being broken.
  const canViewEvents = hasGlobalView(permissions, PermissionResource.EVENTS);
  const canViewVenues = hasGlobalView(permissions, PermissionResource.VENUES);
  const canViewContacts = hasGlobalView(permissions, PermissionResource.CONTACTS);
  const canViewVendors = hasGlobalView(permissions, PermissionResource.VENDORS);
  const canViewUsers =
    hasGlobalView(permissions, PermissionResource.USERS) ||
    hasGlobalView(permissions, PermissionResource.ROLES) ||
    hasGlobalView(permissions, PermissionResource.API_KEYS);
  const canViewEquipment = hasGlobalView(permissions, PermissionResource.EQUIPMENT);
  const canViewSettings = hasGlobalView(permissions, PermissionResource.SETTINGS);
  const canViewSystem = hasGlobalView(permissions, PermissionResource.SYSTEM);
  const canViewWorkflows = hasGlobalView(permissions, PermissionResource.WORKFLOWS);
  // Main nav rather than the Admin dropdown: the default User role carries
  // STORAGE_LOCATIONS WRITE for load-out, so this isn't an admin surface.
  const canViewStorageLocations = hasGlobalView(
    permissions,
    PermissionResource.STORAGE_LOCATIONS,
  );
  const showAdminDropdown =
    canViewUsers ||
    canViewEquipment ||
    canViewSettings ||
    canViewSystem ||
    canViewWorkflows ||
    isSuperAdmin;

  return (
    <header className="bg-white dark:bg-gray-800 shadow">
      <div className="px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white">
            Event Manager
          </Link>
          <nav className="hidden md:flex gap-6">
            {canViewEvents && (
              <Link
                href="/events"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Events
              </Link>
            )}
            {canViewVenues && (
              <Link
                href="/venues"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Venues
              </Link>
            )}
            {canViewContacts && (
              <Link
                href="/contacts"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Contacts
              </Link>
            )}
            {canViewVendors && (
              <Link
                href="/vendors"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Vendors
              </Link>
            )}
            {canViewStorageLocations && (
              <Link
                href="/storage-locations"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Storage
              </Link>
            )}
            {showAdminDropdown && (
              <AdminDropdown
                canViewUsers={canViewUsers}
                canViewEquipment={canViewEquipment}
                canViewSettings={canViewSettings}
                canViewSystem={canViewSystem}
                canViewWorkflows={canViewWorkflows}
                canViewTenants={isSuperAdmin}
              />
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {ctx && ctx.tenants.length > 1 && ctx.active ? (
            <TenantSwitcher tenants={ctx.tenants} activeId={ctx.active.id} />
          ) : ctx?.active ? (
            <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400 truncate max-w-[12rem]">
              {ctx.active.name}
            </span>
          ) : null}
          <Link
            href="/account"
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            {session?.user?.email}
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <button
              type="submit"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

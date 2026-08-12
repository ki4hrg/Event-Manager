import { auth, signOut } from "@/lib/auth";
import Link from "next/link";
import { PermissionResource } from "@prisma/client";
import { hasGlobalView, loadPermissions } from "@/lib/permissions";
import { AdminDropdown } from "./AdminDropdown";

export async function Header() {
  const session = await auth();
  const { permissions } = session?.user?.id
    ? await loadPermissions(session.user.id)
    : { permissions: [] };

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
    canViewUsers || canViewEquipment || canViewSettings || canViewSystem || canViewWorkflows;

  return (
    <header className="bg-white dark:bg-gray-800 shadow">
      <div className="px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white">
            Event Manager
          </Link>
          <nav className="hidden md:flex gap-6">
            <Link
              href="/events"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Events
            </Link>
            <Link
              href="/venues"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Venues
            </Link>
            <Link
              href="/contacts"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Contacts
            </Link>
            <Link
              href="/vendors"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Vendors
            </Link>
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
              />
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
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

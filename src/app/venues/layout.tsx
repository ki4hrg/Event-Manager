import { PermissionsProvider } from "@/components/PermissionsProvider";
import { CATALOG_PERMISSION_RESOURCES } from "@/lib/eventPermissions";
import { permissionLevels } from "@/lib/permissions";

// Mirrors the event layout: resolve the levels once per request so the client
// panels below can hide actions the server would refuse. These catalogs are
// GLOBAL-scoped, so no event id is passed.
export default async function VenuesLayout({ children }: { children: React.ReactNode }) {
  const permissions = await permissionLevels(CATALOG_PERMISSION_RESOURCES);
  return <PermissionsProvider permissions={permissions}>{children}</PermissionsProvider>;
}

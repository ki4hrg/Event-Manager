import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { permissionLevels, requirePermission } from "@/lib/permissions";
import { PermissionsProvider } from "@/components/PermissionsProvider";
import { OPTION_RESOURCES } from "@/lib/optionCategories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Settings", template: "%s · Settings · Event Manager" },
};

// Entry to /settings. Lists edited under another resource (equipment
// categories, location types) also gate on it in their own page.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PermissionResource.SETTINGS, "VIEW");
  // VIEW-only admins get the lists without Add / Edit / Delete controls. Every
  // list's resource: the inventory lists and search render here too.
  const permissions = await permissionLevels(OPTION_RESOURCES);

  return <PermissionsProvider permissions={permissions}>{children}</PermissionsProvider>;
}

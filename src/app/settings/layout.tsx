import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { permissionLevels, requirePermission } from "@/lib/permissions";
import { AdminShell } from "@/components/AdminShell";
import { PermissionsProvider } from "@/components/PermissionsProvider";
import { OPTION_RESOURCES } from "@/lib/optionCategories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Settings", template: "%s · Settings · Event Manager" },
};

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PermissionResource.SETTINGS, "VIEW");
  // VIEW-only admins get the lists without Add / Edit / Delete controls. Every
  // list's resource: search also renders the lists hosted outside Settings.
  const permissions = await permissionLevels(OPTION_RESOURCES);

  return (
    <AdminShell title="Settings" description="Organization details and the dropdown options used across the app.">
      <PermissionsProvider permissions={permissions}>{children}</PermissionsProvider>
    </AdminShell>
  );
}

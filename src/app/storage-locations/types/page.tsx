import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { permissionLevels } from "@/lib/permissions";
import { PermissionsProvider } from "@/components/PermissionsProvider";
import { OptionCategoryEditor } from "@/app/settings/OptionCategoryEditor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Types" };

export default async function LocationTypesPage() {
  // VIEW-only users get the list without Add / Edit / Delete controls.
  const permissions = await permissionLevels([PermissionResource.STORAGE_LOCATIONS]);

  return (
    <div className="max-w-2xl">
      <PermissionsProvider permissions={permissions}>
        <OptionCategoryEditor category="location_type" />
      </PermissionsProvider>
    </div>
  );
}

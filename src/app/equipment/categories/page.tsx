import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { permissionLevels } from "@/lib/permissions";
import { PermissionsProvider } from "@/components/PermissionsProvider";
import { OptionCategoryEditor } from "@/app/(admin)/settings/OptionCategoryEditor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Categories" };

export default async function EquipmentCategoriesPage() {
  // VIEW-only users get the list without Add / Edit / Delete controls.
  const permissions = await permissionLevels([PermissionResource.EQUIPMENT]);

  return (
    <div className="max-w-2xl">
      <PermissionsProvider permissions={permissions}>
        <OptionCategoryEditor category="equipment_category" />
      </PermissionsProvider>
    </div>
  );
}

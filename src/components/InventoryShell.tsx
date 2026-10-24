import { PermissionResource } from "@prisma/client";
import { permissionLevels } from "@/lib/permissions";
import { canDo } from "@/lib/eventPermissions";
import { inventoryNavGroups } from "@/lib/adminNav";
import { PageWrapper } from "./PageWrapper";
import { SideNav } from "./SideNav";

// The inventory area's frame (/equipment, /storage-locations): the section
// nav beside the content column. Each segment's layout gates entry and renders
// it; each page renders its own heading.
export async function InventoryShell({ children }: { children: React.ReactNode }) {
  const levels = await permissionLevels([PermissionResource.EQUIPMENT, PermissionResource.STORAGE_LOCATIONS]);
  const groups = inventoryNavGroups({ canView: (r) => canDo(levels, r, "VIEW") });

  return (
    <PageWrapper>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <SideNav label="Inventory" groups={groups} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </PageWrapper>
  );
}

import { PermissionResource } from "@prisma/client";
import { permissionLevels } from "@/lib/permissions";
import { canDo } from "@/lib/eventPermissions";
import { isSuperAdmin } from "@/lib/tenant";
import { ADMIN_RESOURCES, adminNavGroups, type AdminAccess } from "@/lib/adminNav";
import { PageWrapper } from "./PageWrapper";
import { AdminNav } from "./AdminNav";

// The admin area's frame: the grouped nav beside the content column. Rendered
// once by src/app/(admin)/layout.tsx, so it stays mounted across admin pages.
// It only decides which links to show; each segment's own layout gates entry,
// and each page renders its own heading.
export async function AdminShell({ children }: { children: React.ReactNode }) {
  const [levels, superAdmin] = await Promise.all([permissionLevels(ADMIN_RESOURCES), isSuperAdmin()]);
  const access: AdminAccess = { canView: (r) => canDo(levels, r, "VIEW"), isSuperAdmin: superAdmin };

  return (
    <PageWrapper>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <AdminNav groups={adminNavGroups(access)} search={access.canView(PermissionResource.SETTINGS)} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </PageWrapper>
  );
}

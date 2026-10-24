import { PermissionResource } from "@prisma/client";
import { permissionLevels } from "@/lib/permissions";
import { canDo } from "@/lib/eventPermissions";
import { isSuperAdmin } from "@/lib/tenant";
import { ADMIN_RESOURCES, adminNavGroups, type AdminAccess } from "@/lib/adminNav";
import { PageWrapper } from "./PageWrapper";
import { AdminNav } from "./AdminNav";

// The admin area's frame (/settings, /system): page title plus the grouped
// nav. Layout only; each segment's own layout gates entry before rendering it.
export async function AdminShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const [levels, superAdmin] = await Promise.all([permissionLevels(ADMIN_RESOURCES), isSuperAdmin()]);
  const access: AdminAccess = { canView: (r) => canDo(levels, r, "VIEW"), isSuperAdmin: superAdmin };

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
        {description && <p className="text-gray-600 dark:text-gray-400 mt-1">{description}</p>}
      </div>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <AdminNav groups={adminNavGroups(access)} search={access.canView(PermissionResource.SETTINGS)} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </PageWrapper>
  );
}

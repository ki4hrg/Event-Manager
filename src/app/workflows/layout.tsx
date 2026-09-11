import { PermissionResource } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function WorkflowsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PermissionResource.WORKFLOWS, "VIEW");
  return <>{children}</>;
}

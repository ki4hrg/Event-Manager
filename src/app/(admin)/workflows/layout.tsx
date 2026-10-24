import { PermissionResource } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Entry to /workflows. Each page still checks its own level (VIEW, or WRITE
// for /workflows/new).
export default async function WorkflowsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PermissionResource.WORKFLOWS, "VIEW");
  return <>{children}</>;
}

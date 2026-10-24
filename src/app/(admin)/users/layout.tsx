import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PermissionResource } from "@prisma/client";
import { auth } from "@/lib/auth";
import { hasGlobalView, loadPermissionsForUser } from "@/lib/permissions";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Users", template: "%s · Users · Event Manager" },
};

// Layout permission allows entry on any of USERS / ROLES / API_KEYS so each
// page (Users, Roles, API Keys in the admin nav) is reachable by anyone with
// view on its own resource. Inner pages still enforce their own
// resource-specific checks; the layout only gates section entry.
export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await getTenantContext();
  if (!ctx?.active) redirect("/no-tenant");
  const { permissions } = await loadPermissionsForUser(session.user.id, ctx.active.id);
  const canEnter =
    hasGlobalView(permissions, PermissionResource.USERS) ||
    hasGlobalView(permissions, PermissionResource.ROLES) ||
    hasGlobalView(permissions, PermissionResource.API_KEYS);
  if (!canEnter) redirect("/");

  return <>{children}</>;
}

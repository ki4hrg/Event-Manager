import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PermissionResource } from "@prisma/client";
import { auth } from "@/lib/auth";
import { hasGlobalView, loadPermissionsForUser } from "@/lib/permissions";
import { getTenantContext } from "@/lib/tenant";
import { PageWrapper } from "@/components/PageWrapper";
import { UsersTabs } from "./UsersTabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Users", template: "%s · Users · Event Manager" },
};

// Layout permission allows entry on any of USERS / ROLES / API_KEYS so each
// tab is reachable by anyone with view on its own resource. Inner pages still
// enforce their own resource-specific checks; the layout only gates section entry.
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

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Users</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Manage this organization&apos;s members, roles, and API keys.
        </p>
      </div>
      <UsersTabs />
      {children}
    </PageWrapper>
  );
}

import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { PageWrapper } from "@/components/PageWrapper";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "System", template: "%s · System · Event Manager" },
};

// Tab strip is intentionally omitted while there's only one child route (Email).
// Re-introduce SystemTabs (mirroring SettingsTabs) once a second System page lands.
export default async function SystemLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PermissionResource.SYSTEM, "VIEW");

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">System</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          System-level configuration: email, integrations, and infrastructure.
        </p>
      </div>
      {children}
    </PageWrapper>
  );
}

import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { PageWrapper } from "@/components/PageWrapper";
import { SettingsTabs } from "./SettingsTabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Settings", template: "%s · Settings · Event Manager" },
};

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PermissionResource.SETTINGS, "VIEW");

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Organization details and the dropdown options used across the app.
        </p>
      </div>
      <SettingsTabs />
      {children}
    </PageWrapper>
  );
}

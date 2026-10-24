import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { permissionLevels, requirePermission } from "@/lib/permissions";
import { PageWrapper } from "@/components/PageWrapper";
import { PermissionsProvider } from "@/components/PermissionsProvider";
import { OPTION_SECTIONS, SETTINGS_SECTIONS } from "@/lib/optionCategories";
import { SettingsTabs } from "./SettingsTabs";

export const dynamic = "force-dynamic";

const TABS = [
  ...SETTINGS_SECTIONS.map((s) => ({ label: OPTION_SECTIONS[s].title, href: OPTION_SECTIONS[s].href })),
  { label: "Organization", href: "/settings/organization" },
];

export const metadata: Metadata = {
  title: { default: "Settings", template: "%s · Settings · Event Manager" },
};

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PermissionResource.SETTINGS, "VIEW");
  // VIEW-only admins get the lists without Add / Edit / Delete controls.
  const permissions = await permissionLevels([PermissionResource.SETTINGS]);

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Organization details and the dropdown options used across the app.
        </p>
      </div>
      <SettingsTabs tabs={TABS} />
      <PermissionsProvider permissions={permissions}>{children}</PermissionsProvider>
    </PageWrapper>
  );
}

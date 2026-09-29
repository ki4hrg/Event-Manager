import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { PageWrapper } from "@/components/PageWrapper";
import { StorageLocationTabs } from "./StorageLocationTabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Storage", template: "%s · Storage · Event Manager" },
};

export default async function StorageLocationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermission(PermissionResource.STORAGE_LOCATIONS, "VIEW");

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Storage</h1>
      </div>
      <StorageLocationTabs />
      {children}
    </PageWrapper>
  );
}

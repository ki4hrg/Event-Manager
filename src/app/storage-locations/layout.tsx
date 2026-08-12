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
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Where things live between events. Containers travel to the venue and are packed as a
          unit; a container&apos;s spot on this tree is its home, not where it is right now.
        </p>
      </div>
      <StorageLocationTabs />
      {children}
    </PageWrapper>
  );
}

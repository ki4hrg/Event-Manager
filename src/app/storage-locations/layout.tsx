import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { InventoryShell } from "@/components/InventoryShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Storage Locations", template: "%s · Inventory · Event Manager" },
};

export default async function StorageLocationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermission(PermissionResource.STORAGE_LOCATIONS, "VIEW");

  return (
    <InventoryShell>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-white">Storage Locations</h1>
      {children}
    </InventoryShell>
  );
}

import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { PageWrapper } from "@/components/PageWrapper";
import { EquipmentTabs } from "./EquipmentTabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Equipment", template: "%s · Equipment · Event Manager" },
};

export default async function EquipmentLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PermissionResource.EQUIPMENT, "VIEW");

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Equipment</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Equipment catalog and categories used across AV, Catering, Setup, and Supply orders.
        </p>
      </div>
      <EquipmentTabs />
      {children}
    </PageWrapper>
  );
}

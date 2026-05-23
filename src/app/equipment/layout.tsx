import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Equipment", template: "%s · Equipment · Event Manager" },
};

export default async function EquipmentLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PermissionResource.EQUIPMENT, "VIEW");

  return (
    <PageWrapper>
      <PageHeader
        title="Equipment"
        description="Equipment catalog and categories used across AV, Catering, Setup, and Supply orders."
      />
      {children}
    </PageWrapper>
  );
}

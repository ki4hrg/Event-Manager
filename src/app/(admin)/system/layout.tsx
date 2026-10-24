import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "System", template: "%s · System · Event Manager" },
};

// One child route (Email) for now, so the segment carries the heading.
export default async function SystemLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PermissionResource.SYSTEM, "VIEW");

  return (
    <>
      <PageHeader title="System" />
      {children}
    </>
  );
}

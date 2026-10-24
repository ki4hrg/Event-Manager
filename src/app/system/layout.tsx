import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { AdminShell } from "@/components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "System", template: "%s · System · Event Manager" },
};

// Part of the admin area: the settings nav links here. One child route
// (Email) for now, so no tab strip of its own.
export default async function SystemLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PermissionResource.SYSTEM, "VIEW");

  return (
    <AdminShell title="System" description="System-level configuration: email, integrations, and infrastructure.">
      {children}
    </AdminShell>
  );
}

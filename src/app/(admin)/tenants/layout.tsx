import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/tenant";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Organizations", template: "%s · Organizations · Event Manager" },
};

// Platform administration, not a PermissionResource: only super admins get in.
export default async function TenantsLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Each organization has its own events, venues, contacts, vendors, and settings. Users can belong to several, with a role in each."
      />
      {children}
    </>
  );
}

import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/tenant";
import { PageWrapper } from "@/components/PageWrapper";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Organizations", template: "%s · Organizations · Event Manager" },
};

// Platform administration, not a PermissionResource: only super admins get in.
export default async function TenantsLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Organizations</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Each organization has its own events, venues, contacts, vendors, and settings. Users
          can belong to several, with a role in each.
        </p>
      </div>
      {children}
    </PageWrapper>
  );
}

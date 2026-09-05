import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { PageWrapper } from "@/components/PageWrapper";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "No organization" };

// Where a signed-in account with no tenant membership lands. Must not go
// through requirePermission/requireActiveTenantId itself, or it would redirect
// back here forever; the header copes with a missing active tenant.
export default async function NoTenantPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  if (ctx.active) redirect("/");

  return (
    <PageWrapper>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
        No organization yet
      </h1>
      <EmptyState message="Your account isn't a member of any organization. Ask an administrator to add you to one — you'll see it here as soon as they do." />
    </PageWrapper>
  );
}

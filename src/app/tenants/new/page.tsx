import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { createTenant } from "../actions";
import { TenantForm } from "../TenantForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New organization" };

export default function NewTenantPage() {
  return (
    <div>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Organizations", href: "/tenants" }, { label: "New Organization" }]} />
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mt-2">New Organization</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          A new organization starts with the default dropdown options, equipment catalog, and
          Event Team vendor. Add members after creating it.
        </p>
      </div>
      <TenantForm saveAction={createTenant} />
    </div>
  );
}

import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { createRole } from "../actions";
import { RoleForm } from "../RoleForm";
import { requireSuperAdmin } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New role" };

export default async function NewRolePage() {
  await requireSuperAdmin();
  return (
    <div>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Roles", href: "/users/roles" }, { label: "New Role" }]} />
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mt-2">New Role</h2>
      </div>
      <RoleForm saveAction={createRole} />
    </div>
  );
}

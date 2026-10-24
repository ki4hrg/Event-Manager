import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { createUser } from "../actions";
import { getRoleOptions } from "@/app/(admin)/users/roles/actions";
import { UserForm } from "../UserForm";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New user" };

export default async function NewUserPage() {
  const [roles, ctx] = await Promise.all([getRoleOptions(), getTenantContext()]);

  return (
    <div>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Users", href: "/users" }, { label: "New User" }]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">Add User</h1>
      </div>
      <UserForm
        roles={roles}
        saveAction={createUser}
        tenantName={ctx?.active?.name ?? null}
        canManageSuperAdmin={ctx?.isSuperAdmin ?? false}
      />
    </div>
  );
}

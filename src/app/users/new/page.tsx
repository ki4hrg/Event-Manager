import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { createUser } from "../actions";
import { getRoleOptions } from "@/app/users/roles/actions";
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
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mt-2">Add User</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          An email that already has an account is added to this organization with the chosen
          role; a new email gets an invite.
        </p>
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

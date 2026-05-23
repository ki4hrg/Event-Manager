import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { createUser } from "../actions";
import { getRoleOptions } from "@/app/users/roles/actions";
import { UserForm } from "../UserForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New user" };

export default async function NewUserPage() {
  const roles = await getRoleOptions();

  return (
    <div>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Users", href: "/users" }, { label: "New User" }]} />
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mt-2">New User</h2>
      </div>
      <UserForm roles={roles} saveAction={createUser} />
    </div>
  );
}

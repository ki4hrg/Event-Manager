import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PermissionResource } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import { btnPrimary } from "@/lib/buttonStyles";
import { roleBadgeClass } from "@/lib/roleStyles";
import { PageHeader } from "@/components/PageHeader";
import { getUsers } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  // Layout admits anyone with USERS / ROLES / API_KEYS view, but the user list
  // itself needs USERS.VIEW. If the visitor only has the sibling permissions,
  // redirect them to the first tab they can actually use rather than letting
  // getUsers() bounce them to "/".
  if (!(await hasPermission(PermissionResource.USERS, "VIEW"))) {
    if (await hasPermission(PermissionResource.ROLES, "VIEW")) redirect("/users/roles");
    if (await hasPermission(PermissionResource.API_KEYS, "VIEW")) redirect("/users/api-keys");
    redirect("/");
  }

  const users = await getUsers();

  return (
    <div>
      <PageHeader
        title="Users"
        actions={
          <Link href="/users/new" className={btnPrimary}>
            Add User
          </Link>
        }
      />

      {users.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No users yet.{" "}
          <Link href="/users/new" className="text-blue-600 dark:text-blue-400 hover:underline">
            Create your first user
          </Link>
        </p>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4">
                    <Link
                      href={`/users/${user.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      {user.name || user.email}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {user.email}
                  </td>
                  <td className="px-6 py-4">
                    <span className={roleBadgeClass(user.roleRef?.name)}>
                      {user.roleRef?.name ?? "—"}
                    </span>
                    {user.isSuperAdmin && (
                      <span className="ml-2 px-2 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                        Super admin
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {user.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

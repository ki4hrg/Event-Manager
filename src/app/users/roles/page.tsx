import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Toast } from "@/components/Toast";
import { btnPrimary } from "@/lib/buttonStyles";
import { getRoles, duplicateRole } from "./actions";
import { DuplicateRoleButton } from "./DuplicateRoleButton";
import { isSuperAdmin } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Roles" };

export default async function SettingsRolesPage() {
  const [roles, superAdmin] = await Promise.all([getRoles(), isSuperAdmin()]);

  return (
    <div>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Roles</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Roles define what a member can see and edit. Each membership carries one role.
            Definitions are shared by every organization, so only super admins can change them.
            Built-in roles are rewritten on every deploy — duplicate one to customize it.
          </p>
        </div>
        {superAdmin && (
          <Link href="/users/roles/new" className={`${btnPrimary} self-start sm:shrink-0`}>
            New Role
          </Link>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Memberships
              </th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {roles.map((role) => (
              <tr key={role.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/users/roles/${role.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      {role.name}
                    </Link>
                    {role.isSystem && (
                      <span className="px-2 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        System
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {role.description || "—"}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {role._count.memberships}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {superAdmin && (
                      <DuplicateRoleButton
                        duplicate={async () => {
                          "use server";
                          await duplicateRole(role.id);
                        }}
                      />
                    )}
                    <Link
                      href={`/users/roles/${role.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                    >
                      {role.isSystem || !superAdmin ? "View" : "Edit"}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Toast } from "@/components/Toast";
import { btnPrimary } from "@/lib/buttonStyles";
import { getRoles } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Roles" };

export default async function SettingsRolesPage() {
  const roles = await getRoles();

  return (
    <div>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Roles</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Roles define what a user can see and edit. Each user is assigned a single role.
            Admin and User are built-in and cannot be modified.
          </p>
        </div>
        <Link href="/settings/roles/new" className={btnPrimary}>
          New Role
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
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
                Users
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
                      href={`/settings/roles/${role.id}`}
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
                  {role._count.users}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/settings/roles/${role.id}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                  >
                    {role.isSystem ? "View" : "Edit"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

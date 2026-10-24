import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Toast } from "@/components/Toast";
import { btnPrimary } from "@/lib/buttonStyles";
import { getTenants } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Organizations" };

const th =
  "px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider";

export default async function TenantsPage() {
  const tenants = await getTenants();

  return (
    <div>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-end mb-4">
        <Link href="/tenants/new" className={btnPrimary}>
          New Organization
        </Link>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Slug</th>
              <th className={th}>Members</th>
              <th className={th}>Events</th>
              <th className={th}>Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4">
                  <Link
                    href={`/tenants/${tenant.id}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    {tenant.name}
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm font-mono text-gray-600 dark:text-gray-400">
                  {tenant.slug}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {tenant._count.memberships}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {tenant._count.events}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {tenant.createdAt.toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

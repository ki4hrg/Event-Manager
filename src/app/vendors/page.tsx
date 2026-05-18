import type { Metadata } from "next";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { btnPrimary } from "@/lib/buttonStyles";
import { getVendors } from "./actions";
import { MODEL_LABELS } from "./model-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Vendors" };

export default async function VendorsPage() {
  const vendors = await getVendors();

  return (
    <PageWrapper>
      <PageHeader
        title="Vendors"
        actions={
          <Link href="/vendors/new" className={btnPrimary}>
            New Vendor
          </Link>
        }
      />

      {vendors.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No vendors yet.{" "}
          <Link href="/vendors/new" className="text-blue-600 dark:text-blue-400 hover:underline">
            Create your first vendor
          </Link>
        </p>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Models
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Contacts
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4">
                    <Link
                      href={`/vendors/${vendor.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      {vendor.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {vendor.models.map((model) => (
                        <span
                          key={model}
                          className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                        >
                          {MODEL_LABELS[model] || model}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {vendor._count.contacts > 0 ? vendor._count.contacts : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageWrapper>
  );
}

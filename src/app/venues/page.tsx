import type { Metadata } from "next";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { btnPrimary } from "@/lib/buttonStyles";
import { getVenues } from "./actions";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Venues" };

export default async function VenuesPage() {
  const venues = await getVenues();
  const canWrite = await hasPermission("VENUES", "WRITE");

  return (
    <PageWrapper>
      <PageHeader
        title="Venues"
        actions={
          canWrite ? (
            <Link href="/venues/new" className={btnPrimary}>
              New Venue
            </Link>
          ) : null
        }
      />

      {venues.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No venues yet.
          {canWrite && (
            <>
              {" "}
              <Link href="/venues/new" className="text-blue-600 dark:text-blue-400 hover:underline">
                Create your first venue
              </Link>
            </>
          )}
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
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rooms
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {venues.map((venue) => (
                <tr key={venue.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4">
                    <Link
                      href={`/venues/${venue.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      {venue.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {[venue.city, venue.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {venue._count.rooms}
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

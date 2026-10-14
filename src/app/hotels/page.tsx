import type { Metadata } from "next";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { getOptions } from "@/app/settings/actions";
import { getHotels } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hotels" };

export default async function HotelsPage() {
  const [hotels, areas] = await Promise.all([getHotels(), getOptions("hotel_area")]);
  const regionOf = (area: string | null) => areas.find((a) => a.label === area)?.group ?? null;

  return (
    <PageWrapper>
      <PageHeader title={`Hotels (${hotels.length})`} />
      {hotels.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No hotels yet.</p>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                {["Hotel", "Brand", "Area", "Location", "Proposals", "Last event"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {hotels.map((h) => {
                const last = h.hotelProposals[0]?.event;
                const region = regionOf(h.area);
                return (
                  <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3">
                      <Link href={`/venues/${h.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        {h.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{h.brand ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {h.area ? `${h.area}${region ? ` (${region})` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{[h.city, h.state].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{h.hotelProposals.length}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {last ? (
                        <Link href={`/events/${last.id}/hotels`} className="hover:underline">
                          {last.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageWrapper>
  );
}

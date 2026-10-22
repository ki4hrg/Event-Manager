import type { Metadata } from "next";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { hasPermission } from "@/lib/permissions";
import { getOptions } from "@/app/settings/actions";
import { getHotels } from "./actions";
import { AmenityFilter } from "./AmenityFilter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hotels" };

export default async function HotelsPage({ searchParams }: { searchParams: Promise<{ amenity?: string | string[] }> }) {
  const { amenity } = await searchParams;
  const amenityOptions = (await getOptions("hotel_amenity")).map((a) => a.label);
  // Only listed amenities filter; an unknown one is ignored, not an empty list.
  const selected = (Array.isArray(amenity) ? amenity : amenity ? [amenity] : []).filter((a) => amenityOptions.includes(a));
  const [hotels, areas, canAddHotel] = await Promise.all([getHotels(selected), getOptions("hotel_area"), hasPermission("VENUES", "WRITE")]);
  const regionOf = (area: string | null) => areas.find((a) => a.label === area)?.group ?? null;

  return (
    <PageWrapper>
      <PageHeader
        title={`Hotels (${hotels.length})`}
        actions={
          <>
            <Link href="/hotels/reports" className={btnSecondary}>
              Reports
            </Link>
            {canAddHotel && (
              <Link href="/venues/new?lodging=1" className={btnPrimary}>
                Add Hotel
              </Link>
            )}
          </>
        }
      />
      <AmenityFilter amenities={amenityOptions} selected={selected} />
      {hotels.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{selected.length ? "No hotels have all of these." : "No hotels yet."}</p>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                {["Hotel", "Brand", "Area", "Location", "Amenities", "Proposals", "Last event"].map((h) => (
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
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 min-w-[12rem]">{h.amenities.join(", ") || "—"}</td>
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

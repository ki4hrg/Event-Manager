import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { btnPrimary } from "@/lib/buttonStyles";
import { colorClasses } from "@/lib/colors";
import { BLOCK_TYPE_LABELS, dateKey, formatDateKey } from "@/lib/hotels";
import { getEvent } from "../../actions";
import { getHotelProposals, getProposalFormChoices } from "../../hotels/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hotels" };

export default async function HotelsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const [event, proposals, choices] = await Promise.all([
    getEvent(eventId),
    getHotelProposals(eventId),
    getProposalFormChoices(eventId),
  ]);
  if (!event) notFound();

  const statusColor = (label: string) => colorClasses[choices.statuses.find((s) => s.label === label)?.color ?? "gray"] ?? colorClasses.gray;
  const peakRooms = (nights: (typeof proposals)[number]["nights"]) => {
    const byNight = new Map<string, number>();
    for (const n of nights) byNight.set(dateKey(n.night), (byNight.get(dateKey(n.night)) ?? 0) + (n.rooms ?? 0));
    return Math.max(0, ...Array.from(byNight.values()));
  };

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "Hotels" },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">Hotel Proposals ({proposals.length})</h1>
        </div>
        <Link href={`/events/${eventId}/hotels/proposals/new`} className={`${btnPrimary} text-sm self-start sm:self-auto`}>
          Add Proposal
        </Link>
      </div>

      {proposals.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No proposals yet.</p>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
          {proposals.map((p) => (
            <Link
              key={p.id}
              href={`/events/${eventId}/hotels/proposals/${p.id}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <div className="min-w-0">
                <p className="font-medium text-blue-600 dark:text-blue-400">
                  {p.venue.name}
                  {p.revision > 1 && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">rev {p.revision}</span>}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {[
                    p.blockType ? BLOCK_TYPE_LABELS[p.blockType] : null,
                    p.checkIn && p.checkOut ? `${formatDateKey(dateKey(p.checkIn))} – ${formatDateKey(dateKey(p.checkOut))}` : null,
                    p.nights.length > 0 ? `peak ${peakRooms(p.nights)} rooms` : null,
                    p.leadSource,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(p.status)}`}>{p.status}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

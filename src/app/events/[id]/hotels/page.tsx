import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { colorClasses } from "@/lib/colors";
import { hasPermission } from "@/lib/permissions";
import { BLOCK_TYPE_LABELS, dateKey, formatDateKey } from "@/lib/hotels";
import { getEvent } from "../../actions";
import { blockPickup, pickupTotals } from "@/lib/hotelPickup";
import { getHotelBlocks, getHotelProposals, getProposalFormChoices } from "../../hotels/actions";
import { getRfps } from "../../rfps/actions";
import { RFP_STATUS_COLORS, RFP_STATUS_LABELS } from "@/lib/rfp/sections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hotels" };

export default async function HotelsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const [event, proposals, choices, blocks, rfps, canWrite] = await Promise.all([
    getEvent(eventId),
    getHotelProposals(eventId),
    getProposalFormChoices(eventId),
    getHotelBlocks(eventId),
    getRfps(eventId, "HOTEL"),
    hasPermission("HOTELS", "WRITE", eventId),
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
        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "Hotels" },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">Hotels</h1>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2 self-start sm:self-auto">
            <Link href={`/events/${eventId}/hotels/rfps/new`} className={`${btnSecondary} text-sm`}>
              New RFP
            </Link>
            <Link href={`/events/${eventId}/hotels/proposals/new`} className={`${btnPrimary} text-sm`}>
              Add Proposal
            </Link>
          </div>
        )}
      </div>

      {blocks.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Blocks</h2>
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            {blocks.map((b) => {
              const t = pickupTotals(blockPickup({ isRunOfHouse: b.isRunOfHouse, nights: b.nights, guests: b.pickupGuests, counts: b.pickupCounts }));
              const floor = b.allowedAttrition != null ? 100 - Number(b.allowedAttrition) : null;
              const low = floor != null && t.percent != null && t.percent < floor;
              return (
                <Link
                  key={b.id}
                  href={`/events/${eventId}/hotels/blocks/${b.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-blue-600 dark:text-blue-400">
                      {b.proposal.venue.name}
                      {b.isHq && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">HQ</span>}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {[
                        b.proposal.blockType ? BLOCK_TYPE_LABELS[b.proposal.blockType] : null,
                        b.checkIn && b.checkOut ? `${formatDateKey(dateKey(b.checkIn))} – ${formatDateKey(dateKey(b.checkOut))}` : null,
                        b.cutoffDate ? `cut-off ${formatDateKey(dateKey(b.cutoffDate))}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <p className={`text-sm ${low ? "text-red-600 dark:text-red-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}>
                    {t.pickedUp}/{t.blocked} room nights{t.percent != null && ` · ${t.percent}%`}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {rfps.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">RFPs</h2>
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            {rfps.map((r) => (
              <Link
                key={r.id}
                href={`/events/${eventId}/hotels/rfps/${r.id}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <div className="min-w-0">
                  <p className="font-medium text-blue-600 dark:text-blue-400">{r.title}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {[
                      r.hotelBlocks.map((b) => BLOCK_TYPE_LABELS[b.blockType]).join(", ") || null,
                      r.responseDue ? `due ${formatDateKey(dateKey(r.responseDue))}` : null,
                      r.issuedOn ? `issued ${formatDateKey(dateKey(r.issuedOn))}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClasses[RFP_STATUS_COLORS[r.status]]}`}>
                  {RFP_STATUS_LABELS[r.status]}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Proposals</h2>
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
              <span className="flex items-center gap-2">
                {p.block && <span className="text-xs text-gray-500 dark:text-gray-400">Block</span>}
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(p.status)}`}>{p.status}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

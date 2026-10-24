import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { colorClasses } from "@/lib/colors";
import { hasPermission } from "@/lib/permissions";
import { appliedAttrition, blockTypeLabel, contractKindOf, dateKey, formatDateKey } from "@/lib/hotels";
import { getEvent } from "@/app/events/event";
import { blockPickup, pickupTotals } from "@/lib/hotelPickup";
import { getHotelBlocks, getHotelProposals, getProposalFormChoices } from "../../hotels/actions";
import { scopeLabels } from "@/lib/areas";
import { getRfps } from "../../rfps/actions";
import { newRfpHref } from "@/lib/rfp/kinds";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Hotels" };

const sectionHeading = "text-lg font-medium text-gray-900 dark:text-white";
const listCard = "bg-white dark:bg-gray-800 shadow rounded-lg divide-y divide-gray-200 dark:divide-gray-700";
const rowLink = "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 hover:bg-gray-50 dark:hover:bg-gray-700";

// Lifecycle order: RFPs (listed on the event's RFPs page, the one home for
// them) → the proposals hotels send back → the blocks booked from them.
export default async function HotelsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const [event, proposals, choices, blocks, rfps, canWrite, canEditEvent] = await Promise.all([
    getEvent(eventId),
    getHotelProposals(eventId),
    getProposalFormChoices(eventId),
    getHotelBlocks(eventId),
    getRfps(eventId, "HOTEL"),
    hasPermission("HOTELS", "WRITE", eventId),
    hasPermission("EVENTS", "WRITE", eventId),
  ]);
  if (!event) notFound();

  const statusColor = (label: string) => colorClasses[choices.statuses.find((s) => s.label === label)?.color ?? "gray"] ?? colorClasses.gray;
  const peakRooms = (nights: (typeof proposals)[number]["nights"]) => {
    const byNight = new Map<string, number>();
    for (const n of nights) byNight.set(dateKey(n.night), (byNight.get(dateKey(n.night)) ?? 0) + (n.rooms ?? 0));
    return Math.max(0, ...Array.from(byNight.values()));
  };
  const issued = rfps.filter((r) => r.issuedOn).length;

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "Hotels" },
        ]}
        title="Hotels"
        actions={
          <>
            <Link href={`/events/${eventId}/reports/hotel-info`} className={btnSecondary}>
              Hotel Information
            </Link>
            <Link href={`/events/${eventId}/inbox`} className={btnSecondary}>
              Inbox
            </Link>
            {canWrite && (
              <>
                <Link href={newRfpHref(eventId, "HOTEL")} className={btnSecondary}>
                  New RFP
                </Link>
                <Link href={`/events/${eventId}/hotels/proposals/new`} className={btnPrimary}>
                  Add Proposal
                </Link>
              </>
            )}
          </>
        }
      />

      <section id="rfps" className="mb-8 scroll-mt-24">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className={sectionHeading}>RFPs</h2>
          <Link href={`/events/${eventId}/rfps?kind=HOTEL`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            View RFPs
          </Link>
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {rfps.length === 0 ? "No hotel RFPs yet." : `${rfps.length} hotel RFP${rfps.length === 1 ? "" : "s"} · ${issued} issued`}
        </p>
      </section>

      <section id="proposals" className="mb-8 scroll-mt-24">
        <h2 className={`${sectionHeading} mb-2`}>Proposals</h2>
        {proposals.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No proposals yet.</p>
        ) : (
          <div className={listCard}>
            {proposals.map((p) => (
              <Link key={p.id} href={`/events/${eventId}/hotels/proposals/${p.id}`} className={rowLink}>
                <div className="min-w-0">
                  <p className="font-medium text-blue-600 dark:text-blue-400">
                    {p.venue.name}
                    {p.revision > 1 && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">rev {p.revision}</span>}
                    {p.rfp && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{p.rfp.title}</span>}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {[
                      blockTypeLabel(p.contractType, p.guestType),
                      p.checkIn && p.checkOut ? `${formatDateKey(dateKey(p.checkIn))} – ${formatDateKey(dateKey(p.checkOut))}` : null,
                      p.nights.length > 0 ? `peak ${peakRooms(p.nights)} rooms` : null,
                      p.leadSourceDirect ? "Direct" : p.leadSourceVendor?.name,
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
      </section>

      <section id="blocks" className="mb-8 scroll-mt-24">
        <h2 className={`${sectionHeading} mb-2`}>Blocks</h2>
        {blocks.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No blocks yet.</p>
        ) : (
          <div className={listCard}>
            {blocks.map((b) => {
              const t = pickupTotals(blockPickup({ nights: b.nights, guests: b.pickupGuests, counts: b.pickupCounts }));
              const attrition = appliedAttrition(b.allowedAttrition != null ? Number(b.allowedAttrition) : null, contractKindOf(b.proposal.contractType, choices.contractTypes));
              const floor = attrition != null ? 100 - attrition : null;
              const low = floor != null && t.percent != null && t.percent < floor;
              return (
                <Link key={b.id} href={`/events/${eventId}/hotels/blocks/${b.id}`} className={rowLink}>
                  <div className="min-w-0">
                    <p className="font-medium text-blue-600 dark:text-blue-400">
                      {b.proposal.venue.name}
                      {b.isHq && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">HQ</span>}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {[
                        blockTypeLabel(b.proposal.contractType, b.proposal.guestType),
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
        )}
      </section>

      {choices.areas.length > 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Areas: <span className="text-gray-900 dark:text-white">{scopeLabels(event).join(" · ") || "Any"}</span>
          {canEditEvent && (
            <Link href={`/events/${eventId}/settings`} className="ml-2 text-blue-600 dark:text-blue-400 hover:underline">
              Event settings
            </Link>
          )}
        </p>
      )}
    </>
  );
}

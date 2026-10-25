import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import { blockTypeLabel, dateKey, formatDateKey, formatNight } from "@/lib/hotels";
import { RECONCILE_FLAG_LABELS, RECONCILE_FLAGS, type ReconcileFlag, type ReconcileRow, type ReconcileStay } from "@/lib/hotelReconcile";
import { reportTd, reportTh } from "@/lib/reportStyles";
import { getEvent } from "@/app/events/event";
import { clearFinalGuestList, getBlockFormChoices, getBlockReview, getHotelWorkflow, importFinalGuestList, saveBlockReview } from "../../../../../hotels/actions";
import { ProgressStrip } from "@/components/ProgressStrip";
import { FinalListPanel, ReviewSignOff } from "../../../../../hotels/FinalReview";
import type { FinalGuestArgs } from "../../../../../hotels/blockCore";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Final review" };

const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";
const muted = "text-gray-500 dark:text-gray-400";
// A no-show or a guest we didn't book is a red flag; other differences amber.
const flagClass = (f: ReconcileFlag) =>
  f === "NO_SHOW" || f === "NOT_ON_LIST" || f === "STAYED_AFTER_CANCEL"
    ? "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300"
    : "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300";

function stayText(s: ReconcileStay | null) {
  if (!s) return "—";
  const dates = s.checkIn && s.checkOut ? `${formatNight(s.checkIn)} – ${formatNight(s.checkOut)}` : "Dates not given";
  return [dates, `${s.nights} night${s.nights === 1 ? "" : "s"}`, s.roomType].filter(Boolean).join(" · ");
}

function Flags({ flags }: { flags: ReconcileFlag[] }) {
  if (flags.length === 0) return <span className={`text-sm ${muted}`}>As booked</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${flagClass(f)}`}>
          {RECONCILE_FLAG_LABELS[f]}
        </span>
      ))}
    </span>
  );
}

const who = (r: ReconcileRow) => r.booked?.guestName ?? r.actual?.guestName ?? "—";
const confirmation = (r: ReconcileRow) => r.booked?.confirmationNumber ?? r.actual?.confirmationNumber ?? null;

export default async function BlockReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; blockId: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const [{ id: eventId, blockId }, { all }] = await Promise.all([params, searchParams]);
  const [event, review, choices, workflow] = await Promise.all([
    getEvent(eventId),
    getBlockReview(blockId, eventId),
    getBlockFormChoices(eventId),
    getHotelWorkflow(eventId, { blockId }),
  ]);
  if (!event || !review) notFound();

  const loadAction = async (fileName: string | null, guests: FinalGuestArgs[]) => {
    "use server";
    return importFinalGuestList(blockId, eventId, fileName, guests);
  };
  const clearAction = async () => {
    "use server";
    await clearFinalGuestList(blockId, eventId);
  };
  const signOffAction = async (formData: FormData) => {
    "use server";
    await saveBlockReview(blockId, eventId, formData);
  };

  const venue = review.proposal.venue;
  const base = `/events/${eventId}/hotels/blocks/${blockId}`;
  const reviewHref = `${base}/review`;
  const r = review.reconciliation;
  // Flagged rows by default; ?all=1 lists every stay.
  const showAll = all === "1";
  const rows = r ? (showAll ? r.rows : r.rows.filter((x) => x.flags.length > 0)) : [];
  const flagged = r ? r.rows.filter((x) => x.flags.length > 0).length : 0;

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Hotels", href: `/events/${eventId}/hotels` },
            { label: "Blocks", href: `/events/${eventId}/hotels#blocks` },
            { label: venue.name, href: base },
            { label: "Final review" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1 break-words">Final review · {venue.name}</h1>
        {blockTypeLabel(review.contractType, review.guestType) && <p className={`text-sm mt-1 ${muted}`}>{blockTypeLabel(review.contractType, review.guestType)}</p>}
      </div>
      {workflow && (
        <div className="mb-6">
          <ProgressStrip steps={workflow} current="REVIEW" label="Hotel workflow" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 min-w-0 space-y-6">
          <section className={cardClass}>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Reconciliation</h2>
            {!r ? (
              <p className={`mt-2 text-sm ${muted}`}>No final list loaded.</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                  {review.guestCount} booked · {review.finalCount} stayed · {r.asBooked} as booked · {r.bookedNights} room nights booked, {r.actualNights} stayed
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {RECONCILE_FLAGS.filter((f) => r.counts[f] > 0).map((f) => (
                    <span key={f} className={`px-2 py-0.5 rounded text-xs font-medium ${flagClass(f)}`}>
                      {RECONCILE_FLAG_LABELS[f]} {r.counts[f]}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{showAll ? `Every stay (${r.rows.length})` : `Flagged (${flagged})`}</h3>
                  <Link href={showAll ? reviewHref : `${reviewHref}?all=1`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    {showAll ? "Only flagged" : `Show all ${r.rows.length}`}
                  </Link>
                </div>
                {rows.length === 0 ? (
                  <p className={`mt-2 text-sm ${muted}`}>Every stay matches our list.</p>
                ) : (
                  <>
                    <div className="mt-2 sm:hidden space-y-2">
                      {rows.map((x, i) => (
                        <div key={`${x.guestId ?? ""}-${x.finalId ?? ""}-${i}`} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1">
                          <p className="font-semibold text-sm text-gray-900 dark:text-white break-words">{who(x)}</p>
                          {confirmation(x) && <p className={`text-xs ${muted}`}>#{confirmation(x)}</p>}
                          <p className="text-xs text-gray-700 dark:text-gray-300">Booked: {x.booked ? stayText(x.booked) : "not on our list"}</p>
                          <p className="text-xs text-gray-700 dark:text-gray-300">Stayed: {x.actual ? stayText(x.actual) : "not on the hotel's list"}</p>
                          <Flags flags={x.flags} />
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 hidden sm:block overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr>
                            <th className={reportTh}>Guest</th>
                            <th className={reportTh}>Booked</th>
                            <th className={reportTh}>Stayed</th>
                            <th className={reportTh} />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((x, i) => (
                            <tr key={`${x.guestId ?? ""}-${x.finalId ?? ""}-${i}`}>
                              <td className={reportTd}>
                                <span className="block font-medium text-gray-900 dark:text-white">{who(x)}</span>
                                {confirmation(x) && <span className={`block text-xs ${muted}`}>#{confirmation(x)}</span>}
                              </td>
                              <td className={`${reportTd} text-sm`}>{stayText(x.booked)}</td>
                              <td className={`${reportTd} text-sm`}>{stayText(x.actual)}</td>
                              <td className={reportTd}>
                                <Flags flags={x.flags} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        </div>
        <div className="min-w-0 space-y-6">
          <FinalListPanel
            reviewHref={reviewHref}
            roomTypes={choices.roomTypes}
            loaded={
              review.finalListLoadedAt
                ? {
                    fileName: review.finalListFileName,
                    at: formatDateKey(getDateKeyInTimezone(review.finalListLoadedAt, event.timezone)),
                    stays: review.finalCount,
                  }
                : null
            }
            load={loadAction}
            clear={clearAction}
          />
          <ReviewSignOff
            key={review.reviewedOn ? dateKey(review.reviewedOn) : "open"}
            reviewedOn={review.reviewedOn ? dateKey(review.reviewedOn) : null}
            reviewedBy={review.reviewedBy?.name ?? review.reviewedBy?.email ?? null}
            notes={review.reviewNotes}
            today={getDateKeyInTimezone(new Date(), event.timezone)}
            action={signOffAction}
          />
        </div>
      </div>
    </>
  );
}

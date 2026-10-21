import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { RfpKind } from "@prisma/client";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { hasPermission } from "@/lib/permissions";
import { btnSecondary } from "@/lib/buttonStyles";
import { colorClasses } from "@/lib/colors";
import { dateKey, formatDateKey } from "@/lib/hotels";
import { RFP_KIND_LABELS, resourceForKind } from "@/lib/rfp/kinds";
import { recipientState, recipientSummary } from "@/lib/rfp/recipients";
import { RFP_STATUS_COLORS, RFP_STATUS_LABELS } from "@/lib/rfp/sections";
import { getEvent } from "../../actions";
import { getEventRfps } from "../../rfps/actions";
import { getStandaloneQuotes } from "../../quotes/actions";
import { QUOTE_STATUS_COLORS, QUOTE_STATUS_LABELS } from "@/lib/rfp/quotes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "RFPs" };

const KINDS: RfpKind[] = ["HOTEL", "AV", "CATERING", "PRINT", "OTHER"];

// Every RFP on the event, by kind. Hotel RFPs open under Hotels.
export default async function EventRfpsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const [event, rfps, quotes, writable] = await Promise.all([
    getEvent(eventId),
    getEventRfps(eventId),
    getStandaloneQuotes(eventId),
    Promise.all(KINDS.map((k) => hasPermission(resourceForKind(k), "WRITE", eventId))),
  ]);
  if (!event) notFound();
  const canCreate = KINDS.filter((_, i) => writable[i]);
  const href = (kind: RfpKind, id?: string) =>
    kind === "HOTEL" ? `/events/${eventId}/hotels/rfps/${id ?? "new"}` : id ? `/events/${eventId}/rfps/${id}` : `/events/${eventId}/rfps/new?kind=${kind}`;

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "RFPs" },
        ]}
        title="RFPs"
        actions={
          <>
            {canCreate.map((k) => (
              <Link key={k} href={href(k)} className={`${btnSecondary} text-sm`}>
                + {RFP_KIND_LABELS[k]}
              </Link>
            ))}
            {canCreate.includes("OTHER") && (
              <Link href={`/events/${eventId}/quotes/new`} className={`${btnSecondary} text-sm`}>
                + Quote
              </Link>
            )}
          </>
        }
      />
      {rfps.length === 0 && quotes.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No RFPs yet.</p>}
      {KINDS.map((kind) => {
        const ofKind = rfps.filter((r) => r.kind === kind);
        if (ofKind.length === 0) return null;
        return (
          <section key={kind} className="mb-8">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{RFP_KIND_LABELS[kind]}</h2>
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
              {ofKind.map((r) => {
                const responses = (x: (typeof r.recipients)[number]) =>
                  x.venueId ? r.hotelProposals.filter((p) => p.venueId === x.venueId).length : r.quotes.filter((q) => q.vendorId === x.vendorId).length;
                return (
                  <Link
                    key={r.id}
                    href={href(r.kind, r.id)}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-blue-600 dark:text-blue-400">{r.title}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {[
                          r.service,
                          r.responseDue ? `due ${formatDateKey(dateKey(r.responseDue))}` : null,
                          r.issuedOn ? `issued ${formatDateKey(dateKey(r.issuedOn))}` : null,
                          recipientSummary(r.recipients.map((x) => recipientState({ ...x, responses: responses(x) }, r.responseDue).state)),
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClasses[RFP_STATUS_COLORS[r.status]]}`}>
                      {RFP_STATUS_LABELS[r.status]}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
      {quotes.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Quotes without an RFP</h2>
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            {quotes.map((q) => (
              <Link
                key={q.id}
                href={`/events/${eventId}/quotes/${q.id}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <div className="min-w-0">
                  <p className="font-medium text-blue-600 dark:text-blue-400">{q.vendor.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {[q.reference, q.submittedOn ? `submitted ${formatDateKey(dateKey(q.submittedOn))}` : null, q.revision > 1 ? `rev ${q.revision}` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClasses[QUOTE_STATUS_COLORS[q.status]]}`}>{QUOTE_STATUS_LABELS[q.status]}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

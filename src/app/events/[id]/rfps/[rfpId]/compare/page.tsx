import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { btnOutlinedXs } from "@/lib/buttonStyles";
import { getEvent } from "@/app/events/actions";
import { getQuoteComparison } from "@/app/events/quotes/actions";
import { QuoteCompareView } from "@/app/events/quotes/QuoteCompareView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Quote comparison" };

export default async function VendorRfpComparePage({ params }: { params: Promise<{ id: string; rfpId: string }> }) {
  const { id: eventId, rfpId } = await params;
  const [event, data] = await Promise.all([getEvent(eventId), getQuoteComparison(rfpId, eventId)]);
  if (!event || !data) notFound();
  const base = `/events/${eventId}/rfps/${rfpId}`;
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-6">
        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "RFPs", href: `/events/${eventId}/rfps` },
              { label: data.title, href: base },
              { label: "Quote comparison" },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">Quote comparison</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/compare/print`} className={btnOutlinedXs}>
            Print / Save PDF
          </Link>
          <a href={`/api/events/${eventId}/rfps/${rfpId}?format=docx&doc=compare`} className={btnOutlinedXs} download>
            Word
          </a>
        </div>
      </div>
      <QuoteCompareView data={data} eventId={eventId} />
    </>
  );
}

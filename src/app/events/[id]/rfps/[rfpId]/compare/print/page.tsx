import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { getEvent } from "@/app/events/actions";
import { getQuoteComparison } from "@/app/events/quotes/actions";
import { QuoteCompareView } from "@/app/events/quotes/QuoteCompareView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Quote comparison (print)" };

export default async function VendorRfpComparePrintPage({ params }: { params: Promise<{ id: string; rfpId: string }> }) {
  const { id: eventId, rfpId } = await params;
  const [event, data] = await Promise.all([getEvent(eventId), getQuoteComparison(rfpId, eventId)]);
  if (!event || !data) notFound();
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PrintHeader eventName={event.name} title={`${data.title} — Quote comparison`} backHref={`/events/${eventId}/rfps/${rfpId}/compare`} />
      <QuoteCompareView data={data} eventId={null} />
    </div>
  );
}

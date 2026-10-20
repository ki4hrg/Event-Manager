import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { getEvent } from "@/app/events/actions";
import { getRfpComparison } from "@/app/events/rfps/actions";
import { RfpCompareView } from "@/app/events/rfps/RfpCompareView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Bid comparison (print)" };

export default async function RfpComparePrintPage({ params }: { params: Promise<{ id: string; rfpId: string }> }) {
  const { id: eventId, rfpId } = await params;
  const [event, data] = await Promise.all([getEvent(eventId), getRfpComparison(rfpId, eventId)]);
  if (!event || !data) notFound();
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PrintHeader eventName={event.name} title={`${data.title} — Bid comparison`} backHref={`/events/${eventId}/hotels/rfps/${rfpId}/compare`} />
      <RfpCompareView data={data} eventId={null} />
    </div>
  );
}

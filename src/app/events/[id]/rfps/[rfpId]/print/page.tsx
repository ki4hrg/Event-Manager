import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { getEvent } from "@/app/events/actions";
import { getRfpDocument } from "@/app/events/rfps/actions";
import { RfpDocumentView } from "@/app/events/rfps/RfpDocumentView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "RFP (print)" };

export default async function VendorRfpPrintPage({ params }: { params: Promise<{ id: string; rfpId: string }> }) {
  const { id: eventId, rfpId } = await params;
  const [event, doc] = await Promise.all([getEvent(eventId), getRfpDocument(rfpId, eventId)]);
  if (!event || !doc || doc.meta.kind === "HOTEL") notFound();
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <PrintHeader eventName={event.name} title={doc.meta.title} backHref={`/events/${eventId}/rfps/${rfpId}`} />
      <RfpDocumentView doc={doc} />
    </div>
  );
}

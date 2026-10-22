import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { rfpHref } from "@/lib/rfp/kinds";
import { getEvent } from "@/app/events/event";
import { getRfpDocument } from "./actions";
import { RfpDocumentView } from "./RfpDocumentView";

// The RFP document to print, hotel or vendor; the print route of both RFP trees.
export async function RfpPrint({ eventId, rfpId }: { eventId: string; rfpId: string }) {
  const [event, doc] = await Promise.all([getEvent(eventId), getRfpDocument(rfpId, eventId)]);
  if (!event || !doc) notFound();
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <PrintHeader eventName={event.name} title={doc.meta.title} backHref={rfpHref(eventId, doc.meta.kind, rfpId)} />
      <RfpDocumentView doc={doc} />
    </div>
  );
}

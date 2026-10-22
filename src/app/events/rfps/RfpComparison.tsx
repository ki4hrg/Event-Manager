import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PrintHeader } from "@/components/print/PrintHeader";
import { prisma } from "@/lib/prisma";
import { rfpHref, rfpListHref } from "@/lib/rfp/kinds";
import { getEvent } from "@/app/events/event";
import { getQuoteComparison } from "../quotes/actions";
import { QuoteCompareView } from "../quotes/QuoteCompareView";
import { getRfpComparison } from "./actions";
import { MenuButton } from "./MenuButton";
import { RfpCompareView } from "./RfpCompareView";

// An RFP's responses side by side: a hotel RFP's proposals, a vendor RFP's
// quotes. Rendered by the compare and compare/print routes of both the hotel
// and the vendor RFP trees; links go to the RFP's own tree.
export async function RfpComparison({ eventId, rfpId, print = false }: { eventId: string; rfpId: string; print?: boolean }) {
  const found = await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { kind: true } });
  if (!found) notFound();
  const hotel = found.kind === "HOTEL";
  // Each reader checks the kind's permission.
  const [event, proposals, quotes] = await Promise.all([
    getEvent(eventId),
    hotel ? getRfpComparison(rfpId, eventId) : null,
    hotel ? null : getQuoteComparison(rfpId, eventId),
  ]);
  const data = proposals ?? quotes;
  if (!event || !data) notFound();
  const base = rfpHref(eventId, found.kind, rfpId);
  const title = hotel ? "Proposal comparison" : "Quote comparison";
  const view = proposals ? (
    <RfpCompareView data={proposals} eventId={print ? null : eventId} />
  ) : quotes ? (
    <QuoteCompareView data={quotes} eventId={print ? null : eventId} />
  ) : null;

  if (print) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <PrintHeader eventName={event.name} title={`${data.title} — ${title}`} backHref={`${base}/compare`} />
        {view}
      </div>
    );
  }
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "RFPs", href: rfpListHref(eventId) },
          { label: data.title, href: base },
          { label: title },
        ]}
        title={title}
        actions={
          <MenuButton
            label="Download"
            items={[
              { label: "Print / Save PDF", href: `${base}/compare/print` },
              { label: "Word (.docx)", href: `/api/events/${eventId}/rfps/${rfpId}?format=docx&doc=compare`, download: true },
            ]}
          />
        }
      />
      {view}
    </>
  );
}

import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PrintHeader } from "@/components/print/PrintHeader";
import { prisma } from "@/lib/prisma";
import { resourceForKind, rfpHref, rfpListHref } from "@/lib/rfp/kinds";
import { getEvent } from "@/app/events/event";
import { getQuoteComparison, setRfpLineAward } from "../quotes/actions";
import { QuoteCompareView } from "../quotes/QuoteCompareView";
import { getRfpComparison } from "./actions";
import { MenuButton } from "./MenuButton";
import { combineQuery } from "@/lib/rfp/compare";
import { RfpCompareView } from "./RfpCompareView";

// An RFP's responses side by side: a hotel RFP's proposals, a vendor RFP's
// quotes. Rendered by the compare and compare/print routes of both the hotel
// and the vendor RFP trees; links go to the RFP's own tree.
export async function RfpComparison({
  eventId,
  rfpId,
  print = false,
  combine = [],
}: {
  eventId: string;
  rfpId: string;
  print?: boolean;
  combine?: string[]; // hotel: proposals tried in the combined set
}) {
  const found = await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { kind: true } });
  if (!found) notFound();
  const hotel = found.kind === "HOTEL";
  // Each reader checks the kind's permission.
  const [event, proposals, quotes] = await Promise.all([
    getEvent(eventId),
    hotel ? getRfpComparison(rfpId, eventId, combine) : null,
    hotel ? null : getQuoteComparison(rfpId, eventId),
  ]);
  const data = proposals ?? quotes;
  if (!event || !data) notFound();
  const base = rfpHref(eventId, found.kind, rfpId);
  const title = hotel ? "Proposal comparison" : "Quote comparison";
  // Award RFP lines from the comparison (not on print).
  const awardAction = async (lineItemIds: string[], quoteId: string | null) => {
    "use server";
    await setRfpLineAward(rfpId, eventId, lineItemIds, quoteId);
  };
  const view = proposals ? (
    <RfpCompareView data={proposals} eventId={print ? null : eventId} combine={print ? null : { ids: combine, href: `${base}/compare` }} />
  ) : quotes ? (
    <QuoteCompareView
      data={quotes}
      eventId={print ? null : eventId}
      award={print ? undefined : { action: awardAction, resource: resourceForKind(found.kind) }}
    />
  ) : null;

  if (print) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <PrintHeader eventName={event.name} title={`${data.title} — ${title}`} backHref={`${base}/compare${combineQuery(combine)}`} />
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
              { label: "Print / Save PDF", href: `${base}/compare/print${combineQuery(combine)}` },
              {
                label: "Word (.docx)",
                href: `/api/events/${eventId}/rfps/${rfpId}?format=docx&doc=compare${combine.length ? `&combine=${combine.map(encodeURIComponent).join(",")}` : ""}`,
                download: true,
              },
            ]}
          />
        }
      />
      {view}
    </>
  );
}

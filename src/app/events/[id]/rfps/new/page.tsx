import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { requirePermission } from "@/lib/permissions";
import { dateKey } from "@/lib/hotels";
import { RFP_KIND_LABELS, resourceForKind, VENDOR_RFP_KINDS, type VendorRfpKind } from "@/lib/rfp/kinds";
import { sectionsFor } from "@/lib/rfp/sections";
import { getEvent } from "../../../actions";
import { createRfp, getRfpFormChoices } from "../../../rfps/actions";
import { RfpForm } from "../../../rfps/RfpForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New RFP" };

// ?kind=AV|CATERING|PRINT|OTHER; hotel RFPs start under Hotels.
export default async function NewVendorRfpPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { id: eventId } = await params;
  const raw = (await searchParams).kind;
  const kind: VendorRfpKind = VENDOR_RFP_KINDS.includes(raw as VendorRfpKind) ? (raw as VendorRfpKind) : "OTHER";
  await requirePermission(resourceForKind(kind), "WRITE", eventId);
  const [event, choices] = await Promise.all([getEvent(eventId), getRfpFormChoices(eventId, kind)]);
  if (!event) notFound();

  const createAction = async (formData: FormData) => {
    "use server";
    await createRfp(eventId, kind, formData);
  };
  const title = kind === "OTHER" ? "New RFP" : `New ${RFP_KIND_LABELS[kind]} RFP`;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "RFPs", href: `/events/${eventId}/rfps` },
          { label: title },
        ]}
        title={title}
      />
      <div className="max-w-4xl">
        <RfpForm
          kind={kind}
          resource={resourceForKind(kind)}
          values={{
            title: `${event.name} ${kind === "OTHER" ? "" : `${RFP_KIND_LABELS[kind]} `}RFP`,
            status: "DRAFT",
            responseDue: null,
            decisionBy: null,
            siteVisitBy: null,
            decisionMakerId: null,
            decisionMakerName: null,
            decisionMaker: null,
            regions: [],
            areas: [],
            eventScope: { regions: [], areas: [] },
            sections: sectionsFor(kind).map((s) => s.key),
            introduction: null,
            requirements: null,
            contactId: null,
            contactName: null,
            arrivalDate: dateKey(event.startDate),
            departureDate: dateKey(event.endDate),
            datesFlexible: false,
            dateNotes: null,
            alternateDates: [],
            peakRooms: null,
            historyMatching: false,
            reservationMethod: null,
            commissionNotes: null,
            fbMinimum: null,
            fbIncludes: [],
            fbHistoricalSpend: null,
            amenities: [],
            service: null,
          }}
          choices={choices}
          action={createAction}
          cancelHref={`/events/${eventId}/rfps`}
        />
      </div>
    </>
  );
}

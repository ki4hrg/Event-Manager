import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { dateKey, parseContractTypes } from "@/lib/hotels";
import { sectionsFor } from "@/lib/rfp/sections";
import { getEvent } from "@/app/events/event";
import { createRfp, getRfpFormChoices, getRfpPatternFill } from "../../../../rfps/actions";
import type { RfpBlockArgs } from "../../../../rfps/core";
import { RfpForm } from "../../../../rfps/RfpForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New hotel RFP" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ?basis=&adjust=&series=&contract=&guest=&city=&from=&to= (from the RFP pattern
// report) start the RFP with one block filled from that pattern.
export default async function NewRfpPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ basis?: string; adjust?: string; series?: string; contract?: string; guest?: string; city?: string; from?: string; to?: string }>;
}) {
  const { id: eventId } = await params;
  await requirePermission("HOTELS", "WRITE", eventId);
  const sp = await searchParams;
  const [event, choices, cateringCount] = await Promise.all([
    getEvent(eventId),
    getRfpFormChoices(eventId, "HOTEL"),
    prisma.cateringOrder.count({ where: { eventId } }),
  ]);
  if (!event) notFound();

  let blocks: RfpBlockArgs[] = [];
  if (sp.basis) {
    const basis = sp.basis === "highest" || sp.basis === "latest" ? sp.basis : "average";
    const contractType = parseContractTypes(sp.contract, choices.contractTypes)[0] ?? null;
    const guestType = sp.guest && choices.guestTypes.includes(sp.guest) ? sp.guest : null;
    const adjust = Number.parseInt(sp.adjust ?? "", 10);
    const seriesId = choices.series.some((s) => s.id === sp.series) ? sp.series! : null;
    const day = (v?: string) => (v && DATE_RE.test(v) ? v : undefined);
    const fill = await getRfpPatternFill(eventId, {
      seriesId,
      contractType,
      guestType,
      basis,
      adjust: Number.isFinite(adjust) ? adjust : 0,
      city: sp.city || undefined,
      from: day(sp.from),
      to: day(sp.to),
    });
    if (fill.nights.length) {
      blocks = [
        {
          contractType: contractType ?? choices.contractTypes[0] ?? "",
          guestType: guestType ?? choices.guestTypes[0] ?? null,
          targetRate: null,
          notes: null,
          nights: fill.nights.map((n) => ({ roomType: null, night: n.night, rooms: n.rooms })),
        },
      ];
    }
  }

  const createAction = async (formData: FormData) => {
    "use server";
    await createRfp(eventId, "HOTEL", formData);
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "RFPs", href: `/events/${eventId}/rfps` },
          { label: "New hotel RFP" },
        ]}
        title="New hotel RFP"
      />
      <div className="max-w-4xl">
        <RfpForm
          kind="HOTEL"
          resource="HOTELS"
          values={{
            title: `${event.name} Hotel RFP`,
            status: "DRAFT",
            responseDue: null,
            decisionBy: null,
            siteVisitBy: null,
            decisionMakerId: null,
            decisionMakerName: null,
            decisionMaker: null,
            regions: [],
            areas: [],
            eventScope: { regions: event.regions, areas: event.areas },
            sections: sectionsFor("HOTEL")
              .map((s) => s.key)
              .filter((k) => k !== "fb" || cateringCount > 0),
            introduction: null,
            requirements: null,
            contactId: null,
            contactName: null,
            arrivalDate: dateKey(event.startDate),
            departureDate: dateKey(event.endDate),
            datesFlexible: false,
            dateNotes: null,
            alternateDates: [],
            // A block filled from the pattern report brings its peak along.
            peakRooms: blocks.length ? Math.max(...blocks[0].nights.map((n) => n.rooms)) : null,
            historyMatching: false,
            reservationMethod: null,
            commissionNotes: null,
            fbMinimum: null,
            fbIncludes: [],
            fbHistoricalSpend: null,
            amenities: [],
          }}
          choices={choices}
          action={createAction}
          cancelHref={`/events/${eventId}/rfps`}
          hiddenFields={blocks.length ? { blocks: JSON.stringify(blocks) } : undefined}
        />
      </div>
    </>
  );
}

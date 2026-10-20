import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { BLOCK_TYPES } from "@/lib/hotels";
import { sectionsFor } from "@/lib/rfp/sections";
import { getEvent } from "../../../../actions";
import { createRfp, getRfpFormChoices, getRfpPatternFill } from "../../../../rfps/actions";
import type { RfpBlockArgs } from "../../../../rfps/core";
import { RfpForm } from "../../../../rfps/RfpForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New RFP" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ?basis=&adjust=&series=&blockType=&city=&from=&to= (from the RFP pattern
// report) start the RFP with one block filled from that pattern.
export default async function NewRfpPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ basis?: string; adjust?: string; series?: string; blockType?: string; city?: string; from?: string; to?: string }>;
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
    const blockType = BLOCK_TYPES.find((t) => t.value === sp.blockType)?.value ?? null;
    const adjust = Number.parseInt(sp.adjust ?? "", 10);
    const seriesId = choices.series.some((s) => s.id === sp.series) ? sp.series! : null;
    const day = (v?: string) => (v && DATE_RE.test(v) ? v : undefined);
    const fill = await getRfpPatternFill(eventId, {
      seriesId,
      blockType,
      basis,
      adjust: Number.isFinite(adjust) ? adjust : 0,
      city: sp.city || undefined,
      from: day(sp.from),
      to: day(sp.to),
    });
    if (fill.nights.length) {
      blocks = [
        {
          blockType: blockType ?? "CONTRACT",
          isRunOfHouse: choices.roomTypes.length === 0,
          targetRate: null,
          notes: null,
          nights: fill.nights.map((n) => ({ roomType: choices.roomTypes[0] ?? null, night: n.night, rooms: n.rooms })),
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
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Hotels", href: `/events/${eventId}/hotels` },
            { label: "New RFP" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">New RFP</h1>
      </div>
      <div className="max-w-4xl">
        <RfpForm
          kind="HOTEL"
          resource="HOTELS"
          values={{
            title: `${event.name} Hotel RFP`,
            status: "DRAFT",
            responseDue: null,
            decisionBy: null,
            sections: sectionsFor("HOTEL")
              .map((s) => s.key)
              .filter((k) => k !== "fb" || cateringCount > 0),
            introduction: null,
            requirements: null,
            contactId: null,
            contactName: null,
            showRoomNames: false,
            excludedFunctionTypes: [],
          }}
          choices={choices}
          action={createAction}
          cancelHref={`/events/${eventId}/hotels`}
          hiddenFields={blocks.length ? { blocks: JSON.stringify(blocks) } : undefined}
        />
      </div>
    </>
  );
}

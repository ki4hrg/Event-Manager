import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { dateFromKey, dateKey } from "@/lib/hotels";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { getEvent } from "../../../../actions";
import { createHotelProposal, getProposalFormChoices } from "../../../../hotels/actions";
import { ProposalForm, type ProposalTemplate } from "../../../../hotels/ProposalForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New proposal" };

export default async function NewProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ venueId?: string; rfpBlockId?: string }>;
}) {
  const { id: eventId } = await params;
  await requirePermission("HOTELS", "WRITE", eventId);
  const { venueId, rfpBlockId } = await searchParams;
  const [event, choices, rfpBlock] = await Promise.all([
    getEvent(eventId),
    getProposalFormChoices(eventId),
    rfpBlockId
      ? prisma.rfpHotelBlock.findFirst({
          where: { id: rfpBlockId, rfp: { eventId } },
          include: {
            nights: { orderBy: [{ night: "asc" }, { roomType: "asc" }] },
            rfp: { select: { concessions: { orderBy: { sortOrder: "asc" } } } },
          },
        })
      : null,
  ]);
  if (!event) notFound();

  // Recording a hotel's answer to an RFP block: start from what was requested.
  const fromRfp: ProposalTemplate | undefined = rfpBlock
    ? {
        rfpBlockId: rfpBlock.id,
        contractType: rfpBlock.contractType,
        guestType: rfpBlock.guestType,
        status: choices.statuses.find((s) => s.group === "PENDING")?.label ?? null,
        nights: rfpBlock.nights.map((n) => ({ roomType: n.roomType, night: dateKey(n.night), rate: null, rooms: n.rooms })),
      }
    : undefined;
  const nights = rfpBlock?.nights.map((n) => dateKey(n.night)) ?? [];
  const checkIn = nights.length ? nights[0] : dateKey(event.startDate);
  const checkOut = nights.length ? dateKey(new Date(dateFromKey(nights[nights.length - 1]).getTime() + 86_400_000)) : dateKey(event.endDate);

  const createAction = async (formData: FormData) => {
    "use server";
    await createHotelProposal(eventId, formData);
  };

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Hotels", href: `/events/${eventId}/hotels` },
            { label: "New Proposal" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">New Proposal</h1>
      </div>
      <div className="max-w-5xl">
        <ProposalForm
          choices={choices}
          defaultCheckIn={checkIn}
          defaultCheckOut={checkOut}
          fromRfp={fromRfp}
          concessions={(rfpBlock?.rfp.concessions ?? []).map((c) => ({
            id: c.id,
            label: c.label,
            value: c.value,
            required: c.required,
            offered: null,
            met: null,
          }))}
          defaultVenueId={choices.venues.some((v) => v.id === venueId) ? venueId : undefined}
          action={createAction}
          cancelHref={`/events/${eventId}/hotels`}
        />
      </div>
    </>
  );
}

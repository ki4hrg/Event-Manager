import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import { requirePermission } from "@/lib/permissions";
import { getEvent } from "../../../../actions";
import { createHotelProposal, getProposalFormChoices } from "../../../../hotels/actions";
import { ProposalForm } from "../../../../hotels/ProposalForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New proposal" };

export default async function NewProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ venueId?: string }>;
}) {
  const { id: eventId } = await params;
  await requirePermission("HOTELS", "WRITE", eventId);
  const { venueId } = await searchParams;
  const [event, choices] = await Promise.all([getEvent(eventId), getProposalFormChoices(eventId)]);
  if (!event) notFound();

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
          defaultCheckIn={getDateKeyInTimezone(event.startDate, event.timezone)}
          defaultCheckOut={getDateKeyInTimezone(event.endDate, event.timezone)}
          defaultVenueId={choices.venues.some((v) => v.id === venueId) ? venueId : undefined}
          action={createAction}
          cancelHref={`/events/${eventId}/hotels`}
        />
      </div>
    </>
  );
}

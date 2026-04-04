import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../actions";
import {
  getPresentations,
  getTracks,
  duplicatePresentation,
  deletePresentation,
} from "../../presentations/actions";
import { PresentationList } from "../../presentations/PresentationList";
import { PageWrapper } from "@/components/PageWrapper";
import { EventTabs } from "../EventTabs";
import { getOptions } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function PresentationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const [event, presentations, tracks, presentationTypes] = await Promise.all([
    getEvent(eventId),
    getPresentations(eventId),
    getTracks(eventId),
    getOptions("presentation_type"),
  ]);

  if (!event) {
    notFound();
  }

  const duplicatePresentationAction = async (presentationId: string) => {
    "use server";
    await duplicatePresentation(presentationId, eventId);
  };

  const deletePresentationAction = async (presentationId: string) => {
    "use server";
    await deletePresentation(presentationId, eventId);
  };

  return (
    <PageWrapper>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: event.name, href: `/events/${eventId}` }, { label: "Presentations" }]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <EventTabs eventId={eventId} />

      <PresentationList
        presentations={presentations}
        eventId={eventId}
        tracks={tracks}
        presentationTypes={presentationTypes}
        duplicatePresentation={duplicatePresentationAction}
        deletePresentation={deletePresentationAction}
      />
    </PageWrapper>
  );
}

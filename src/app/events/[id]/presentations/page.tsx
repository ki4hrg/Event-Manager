import { notFound } from "next/navigation";
import Link from "next/link";
import { getEvent } from "../../actions";
import {
  getPresentations,
  duplicatePresentation,
  deletePresentation,
} from "../../presentations/actions";
import { PresentationList } from "../../presentations/PresentationList";
import { getOptions } from "@/app/settings/actions";
import { PageWrapper } from "@/components/PageWrapper";

export const dynamic = "force-dynamic";

export default async function PresentationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const [event, presentations, tracks, levels] = await Promise.all([
    getEvent(eventId),
    getPresentations(eventId),
    getOptions("presentation_track"),
    getOptions("presentation_level"),
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
      <div className="mb-6">
        <Link
          href={`/events/${eventId}`}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          &larr; Back to {event.name}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          Presentations
        </h1>
      </div>

      <PresentationList
        presentations={presentations}
        eventId={eventId}
        tracks={tracks}
        levels={levels}
        duplicatePresentation={duplicatePresentationAction}
        deletePresentation={deletePresentationAction}
      />
    </PageWrapper>
  );
}

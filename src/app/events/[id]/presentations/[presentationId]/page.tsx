import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { getEvent } from "../../../actions";
import {
  getPresentation,
  updatePresentation,
  deletePresentation,
  duplicatePresentation,
  createSession,
  updateSession,
  deleteSession,
  addSpeaker,
  updateSpeaker,
  removeSpeaker,
  searchContacts,
} from "../../../presentations/actions";
import { PresentationForm } from "../../../presentations/PresentationForm";
import { SessionList } from "../../../presentations/SessionList";
import { SpeakerList } from "../../../presentations/SpeakerList";
import { getOptions } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function PresentationPage({
  params,
}: {
  params: Promise<{ id: string; presentationId: string }>;
}) {
  const { id: eventId, presentationId } = await params;
  const [event, presentation, tracks, levels, avEquipment, presenterRoles] = await Promise.all([
    getEvent(eventId),
    getPresentation(presentationId),
    getOptions("presentation_track"),
    getOptions("presentation_level"),
    getOptions("av_equipment"),
    getOptions("presenter_role"),
  ]);

  if (!event || !presentation) {
    notFound();
  }

  // Get rooms from the event's venue
  const rooms = event.venueId
    ? await prisma.room.findMany({
        where: { venueId: event.venueId },
        orderBy: { name: "asc" },
      })
    : [];

  const updatePresentationAction = async (formData: FormData) => {
    "use server";
    await updatePresentation(presentationId, eventId, formData);
  };

  const deletePresentationAction = async () => {
    "use server";
    await deletePresentation(presentationId, eventId);
  };

  const duplicatePresentationAction = async () => {
    "use server";
    await duplicatePresentation(presentationId, eventId);
  };

  const createSessionAction = async (formData: FormData) => {
    "use server";
    return createSession(presentationId, eventId, formData);
  };

  const updateSessionAction = async (sessionId: string, formData: FormData) => {
    "use server";
    return updateSession(sessionId, presentationId, eventId, formData);
  };

  const deleteSessionAction = async (sessionId: string) => {
    "use server";
    await deleteSession(sessionId, presentationId, eventId);
  };

  const addSpeakerAction = async (formData: FormData) => {
    "use server";
    await addSpeaker(presentationId, eventId, formData);
  };

  const updateSpeakerAction = async (speakerId: string, formData: FormData) => {
    "use server";
    await updateSpeaker(speakerId, presentationId, eventId, formData);
  };

  const removeSpeakerAction = async (speakerId: string) => {
    "use server";
    await removeSpeaker(speakerId, presentationId, eventId);
  };

  const searchContactsAction = async (query: string) => {
    "use server";
    return searchContacts(query);
  };

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link
            href={`/events/${eventId}/presentations`}
            className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
          >
            &larr; Back to Presentations
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {presentation.title}
          </h1>
        </div>
        <div className="flex gap-2">
          <form action={duplicatePresentationAction}>
            <button
              type="submit"
              className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Duplicate
            </button>
          </form>
          <DeleteButton
            action={deletePresentationAction}
            confirmMessage="Are you sure you want to delete this presentation? All sessions will also be deleted."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <PresentationForm
            presentation={presentation}
            eventId={eventId}
            tracks={tracks}
            levels={levels}
            avEquipment={avEquipment}
            action={updatePresentationAction}
          />
        </div>

        <div className="space-y-6">
          <SpeakerList
            speakers={presentation.speakers}
            presenterRoles={presenterRoles}
            presentationId={presentationId}
            addSpeaker={addSpeakerAction}
            updateSpeaker={updateSpeakerAction}
            removeSpeaker={removeSpeakerAction}
            searchContacts={searchContactsAction}
          />

          <SessionList
            sessions={presentation.sessions}
            rooms={rooms}
            presentationId={presentationId}
            timezone={event.timezone}
            createSession={createSessionAction}
            updateSession={updateSessionAction}
            deleteSession={deleteSessionAction}
          />
        </div>
      </div>
    </PageWrapper>
  );
}

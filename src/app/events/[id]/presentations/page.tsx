import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import type { EntityStatus } from "@prisma/client";
import { getEvent } from "@/app/events/event";
import {
  getPresentations,
  getTracks,
  createTrack,
  updateTrack,
  deleteTrack,
  duplicatePresentation,
  deletePresentation,
  deletePresentations,
  bulkUpdatePresentations,
} from "../../presentations/actions";
import { PresentationList } from "../../presentations/PresentationList";
import { TrackPanel } from "../../presentations/TrackPanel";
import { getOptions, getSubstatusOptions } from "@/app/settings/actions";
import { getHiddenColumns } from "@/app/events/table-columns-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Presentations" };

export default async function PresentationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; slot?: string; speaker?: string }>;
}) {
  const { id: eventId } = await params;
  const { status: initialStatus, slot: initialSlot, speaker: initialSpeaker } = (await searchParams) ?? {};
  const [event, presentations, tracks, presentationTypes, substatuses, hiddenColumns] = await Promise.all([
    getEvent(eventId),
    getPresentations(eventId),
    getTracks(eventId),
    getOptions("presentation_type"),
    getSubstatusOptions(),
    getHiddenColumns("presentations"),
  ]);

  if (!event) {
    notFound();
  }

  const createTrackAction = async (formData: FormData) => {
    "use server";
    await createTrack(eventId, formData);
  };

  const updateTrackAction = async (trackId: string, formData: FormData) => {
    "use server";
    await updateTrack(trackId, eventId, formData);
  };

  const deleteTrackAction = async (trackId: string) => {
    "use server";
    await deleteTrack(trackId, eventId);
  };

  const duplicatePresentationAction = async (presentationId: string) => {
    "use server";
    await duplicatePresentation(presentationId, eventId);
  };

  const deletePresentationAction = async (presentationId: string) => {
    "use server";
    await deletePresentation(presentationId, eventId);
  };

  const deletePresentationsAction = async (ids: string[]) => {
    "use server";
    await deletePresentations(ids, eventId);
  };

  const bulkUpdatePresentationsAction = async (
    ids: string[],
    updates: { status?: EntityStatus; substatus?: string | null; trackId?: string | null; type?: string }
  ) => {
    "use server";
    await bulkUpdatePresentations(ids, eventId, updates);
  };

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: event.name, href: `/events/${eventId}` }, { label: "Presentations" }]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>


      <TrackPanel
        tracks={tracks}
        createTrack={createTrackAction}
        updateTrack={updateTrackAction}
        deleteTrack={deleteTrackAction}
      />

      <PresentationList
        presentations={presentations}
        eventId={eventId}
        tracks={tracks}
        presentationTypes={presentationTypes}
        substatuses={substatuses}
        initialStatus={initialStatus}
        initialSlot={initialSlot}
        initialSpeaker={initialSpeaker}
        initialHiddenColumns={hiddenColumns}
        duplicatePresentation={duplicatePresentationAction}
        deletePresentation={deletePresentationAction}
        deletePresentations={deletePresentationsAction}
        bulkUpdatePresentations={bulkUpdatePresentationsAction}
      />
    </>
  );

}

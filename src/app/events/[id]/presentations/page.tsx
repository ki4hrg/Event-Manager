import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../actions";
import {
  getPresentations,
  getTracks,
  createTrack,
  updateTrack,
  deleteTrack,
  duplicatePresentation,
  deletePresentation,
} from "../../presentations/actions";
import { PresentationList } from "../../presentations/PresentationList";
import { TrackPanel } from "../../presentations/TrackPanel";
import { getOptions } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function PresentationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string }>;
}) {
  const { id: eventId } = await params;
  const { status: initialStatus } = (await searchParams) ?? {};
  const [event, presentations, tracks, presentationTypes] = await Promise.all([
    getEvent(eventId),
    getPresentations(eventId),
    getTracks(eventId),
    getOptions("presentation_type"),
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

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: event.name, href: `/events/${eventId}` }, { label: "Presentations" }]} />
        <div className="flex items-center justify-between mt-1">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {event.name}
          </h1>
          <Link
            href={`/events/${eventId}/presentations/import`}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Import from CSV
          </Link>
        </div>
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
        initialStatus={initialStatus}
        duplicatePresentation={duplicatePresentationAction}
        deletePresentation={deletePresentationAction}
      />
    </>
  );

}

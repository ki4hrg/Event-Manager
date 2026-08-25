import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getEvent } from "../../../actions";
import { createPresentation, getTracks, searchContacts } from "../../../presentations/actions";
import { PresentationForm } from "../../../presentations/PresentationForm";
import { getOptions } from "@/app/settings/actions";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New presentation" };

export default async function NewPresentationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  // A VIEW-only user has no business on a create form; gate the page so they
  // never reach a form whose action would refuse the submit.
  await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const [event, tracks, presenterRoles, presentationTypes] = await Promise.all([
    getEvent(eventId),
    getTracks(eventId),
    getOptions("presenter_role"),
    getOptions("presentation_type"),
  ]);

  if (!event) {
    notFound();
  }

  const createPresentationAction = async (formData: FormData) => {
    "use server";
    await createPresentation(eventId, formData);
  };

  const searchContactsAction = async (query: string) => {
    "use server";
    return searchContacts(query);
  };

  return (
    <>
      <div className="mb-6">
        <Link
          href={`/events/${eventId}/presentations`}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          &larr; Back to Presentations
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          New Presentation
        </h1>
      </div>

      <PresentationForm
        eventId={eventId}
        tracks={tracks}
        presenterRoles={presenterRoles}
        presentationTypes={presentationTypes}
        action={createPresentationAction}
        searchContacts={searchContactsAction}
      />
    </>
  );

}

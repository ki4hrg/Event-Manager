import { notFound } from "next/navigation";
import Link from "next/link";
import { getEvent } from "../../../actions";
import { createPresentation } from "../../../presentations/actions";
import { PresentationForm } from "../../../presentations/PresentationForm";
import { getOptions } from "@/app/settings/actions";
import { PageWrapper } from "@/components/PageWrapper";

export const dynamic = "force-dynamic";

export default async function NewPresentationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const [event, tracks, levels, avEquipment] = await Promise.all([
    getEvent(eventId),
    getOptions("presentation_track"),
    getOptions("presentation_level"),
    getOptions("av_equipment"),
  ]);

  if (!event) {
    notFound();
  }

  const createPresentationAction = async (formData: FormData) => {
    "use server";
    await createPresentation(eventId, formData);
  };

  return (
    <PageWrapper>
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
        levels={levels}
        avEquipment={avEquipment}
        action={createPresentationAction}
      />
    </PageWrapper>
  );
}

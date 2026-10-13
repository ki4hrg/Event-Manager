import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../../actions";
import { createExhibitBooth, getBoothFormChoices } from "../../../exhibits/actions";
import { BoothForm } from "../../../exhibits/BoothForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New booth" };

export default async function NewBoothPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functionId?: string }>;
}) {
  const { id: eventId } = await params;
  const { functionId } = await searchParams;
  const [event, choices] = await Promise.all([getEvent(eventId), getBoothFormChoices(eventId)]);
  if (!event) notFound();

  const createAction = async (formData: FormData) => {
    "use server";
    await createExhibitBooth(eventId, formData);
  };

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Exhibits", href: `/events/${eventId}/exhibits` },
            { label: "New Booth" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">New Booth</h1>
      </div>
      <div className="max-w-3xl">
        <BoothForm
          timezone={event.timezone}
          functions={choices.functions}
          contacts={choices.contacts}
          boothTypes={choices.boothTypes}
          defaultFunctionId={choices.functions.some((f) => f.id === functionId) ? functionId : undefined}
          action={createAction}
          cancelHref={`/events/${eventId}/exhibits`}
        />
      </div>
    </>
  );
}
